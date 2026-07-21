-- PP-013 adds one durable Postgres-native queue and the smallest job ledger
-- needed for bounded retries, idempotency, and founder-operated replay.

create extension if not exists pgmq;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select pgmq.create('pull_prix_jobs');
revoke all on schema pgmq from public;

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  job_type text not null check (job_type ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  idempotency_key text not null unique check (length(idempotency_key) between 3 and 200),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'retrying', 'succeeded', 'failed')),
  queue_message_id bigint unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  last_error text,
  result jsonb,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index background_jobs_organization_id_idx
  on public.background_jobs (organization_id);
create index background_jobs_failed_idx
  on public.background_jobs (failed_at desc)
  where status = 'failed';
create index background_jobs_pending_idx
  on public.background_jobs (available_at, created_at)
  where status in ('queued', 'retrying');

create trigger background_jobs_set_updated_at
before update on public.background_jobs
for each row execute function private.set_updated_at();

alter table public.background_jobs enable row level security;
revoke all on table public.background_jobs from anon, authenticated;

create function public.enqueue_background_job(
  p_job_type text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb,
  p_organization_id uuid default null,
  p_max_attempts integer default 3,
  p_delay_seconds integer default 0
)
returns public.background_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.background_jobs;
  selected_message_id bigint;
begin
  if p_job_type is null or p_job_type !~ '^[a-z][a-z0-9_.-]{2,79}$' then
    raise exception 'invalid job type' using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 3 and 200 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'job payload must be an object' using errcode = '22023';
  end if;
  if p_max_attempts not between 1 and 10 then
    raise exception 'max attempts must be between 1 and 10' using errcode = '22023';
  end if;
  if p_delay_seconds not between 0 and 86400 then
    raise exception 'delay must be between 0 and 86400 seconds' using errcode = '22023';
  end if;

  insert into public.background_jobs (
    organization_id,
    job_type,
    idempotency_key,
    payload,
    max_attempts,
    available_at
  )
  values (
    p_organization_id,
    p_job_type,
    p_idempotency_key,
    p_payload,
    p_max_attempts,
    now() + make_interval(secs => p_delay_seconds)
  )
  on conflict (idempotency_key) do nothing
  returning * into selected_job;

  if selected_job.id is null then
    select * into strict selected_job
    from public.background_jobs
    where idempotency_key = p_idempotency_key;

    if selected_job.job_type <> p_job_type
      or selected_job.organization_id is distinct from p_organization_id
      or selected_job.payload <> p_payload
    then
      raise exception 'idempotency key already belongs to different job parameters'
        using errcode = '22023';
    end if;

    return selected_job;
  end if;

  select send into selected_message_id
  from pgmq.send(
    'pull_prix_jobs',
    jsonb_build_object('schema_version', 1, 'job_id', selected_job.id),
    p_delay_seconds
  );

  update public.background_jobs
  set queue_message_id = selected_message_id
  where id = selected_job.id
  returning * into selected_job;

  return selected_job;
end;
$$;

create function public.claim_background_jobs(
  p_batch_size integer default 5,
  p_visibility_timeout_seconds integer default 60
)
returns table (
  job_id uuid,
  queue_message_id bigint,
  job_type text,
  payload jsonb,
  attempt_count integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_batch_size not between 1 and 10 then
    raise exception 'batch size must be between 1 and 10' using errcode = '22023';
  end if;
  if p_visibility_timeout_seconds not between 1 and 900 then
    raise exception 'visibility timeout must be between 1 and 900 seconds'
      using errcode = '22023';
  end if;

  return query
  with claimed as materialized (
    select *
    from pgmq.read(
      'pull_prix_jobs',
      p_visibility_timeout_seconds,
      p_batch_size
    )
  ),
  updated as (
    update public.background_jobs job
    set
      status = 'processing',
      attempt_count = claimed.read_ct::integer,
      started_at = coalesce(job.started_at, now()),
      updated_at = now()
    from claimed
    where job.id = (claimed.message->>'job_id')::uuid
      and job.queue_message_id = claimed.msg_id
      and job.status in ('queued', 'retrying')
    returning
      job.id,
      job.queue_message_id,
      job.job_type,
      job.payload,
      job.attempt_count,
      job.max_attempts
  )
  select * from updated;
end;
$$;

create function public.complete_background_job(
  p_job_id uuid,
  p_queue_message_id bigint,
  p_result jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.background_jobs;
begin
  select * into selected_job
  from public.background_jobs
  where id = p_job_id
  for update;

  if selected_job.id is null
    or selected_job.queue_message_id <> p_queue_message_id
    or selected_job.status <> 'processing'
  then
    return false;
  end if;

  if not pgmq.archive('pull_prix_jobs', p_queue_message_id) then
    return false;
  end if;

  update public.background_jobs
  set
    status = 'succeeded',
    result = coalesce(p_result, '{}'::jsonb),
    last_error = null,
    completed_at = now(),
    failed_at = null
  where id = p_job_id;

  return true;
end;
$$;

create function public.fail_background_job(
  p_job_id uuid,
  p_queue_message_id bigint,
  p_error text,
  p_retry_delay_seconds integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.background_jobs;
  retry_delay integer;
begin
  select * into selected_job
  from public.background_jobs
  where id = p_job_id
  for update;

  if selected_job.id is null
    or selected_job.queue_message_id <> p_queue_message_id
    or selected_job.status <> 'processing'
  then
    return 'ignored';
  end if;

  if selected_job.attempt_count >= selected_job.max_attempts then
    perform pgmq.archive('pull_prix_jobs', p_queue_message_id);

    update public.background_jobs
    set
      status = 'failed',
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'unknown error'), 1000),
      failed_at = now()
    where id = p_job_id;

    return 'failed';
  end if;

  retry_delay := coalesce(
    p_retry_delay_seconds,
    least(300, 15 * power(2, greatest(selected_job.attempt_count - 1, 0))::integer)
  );

  if retry_delay not between 0 and 3600 then
    raise exception 'retry delay must be between 0 and 3600 seconds'
      using errcode = '22023';
  end if;

  perform pgmq.set_vt('pull_prix_jobs', p_queue_message_id, retry_delay);

  update public.background_jobs
  set
    status = 'retrying',
    last_error = left(coalesce(nullif(btrim(p_error), ''), 'unknown error'), 1000),
    available_at = now() + make_interval(secs => retry_delay)
  where id = p_job_id;

  return 'retrying';
end;
$$;

create function public.replay_background_job(
  p_job_id uuid,
  p_delay_seconds integer default 0
)
returns public.background_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.background_jobs;
  selected_message_id bigint;
begin
  if p_delay_seconds not between 0 and 86400 then
    raise exception 'delay must be between 0 and 86400 seconds' using errcode = '22023';
  end if;

  select * into selected_job
  from public.background_jobs
  where id = p_job_id
  for update;

  if selected_job.id is null then
    raise exception 'background job not found' using errcode = 'P0002';
  end if;
  if selected_job.status <> 'failed' then
    raise exception 'only failed jobs can be replayed' using errcode = '55000';
  end if;

  select send into selected_message_id
  from pgmq.send(
    'pull_prix_jobs',
    jsonb_build_object('schema_version', 1, 'job_id', selected_job.id),
    p_delay_seconds
  );

  update public.background_jobs
  set
    status = 'queued',
    queue_message_id = selected_message_id,
    attempt_count = 0,
    last_error = null,
    available_at = now() + make_interval(secs => p_delay_seconds),
    started_at = null,
    completed_at = null,
    failed_at = null
  where id = p_job_id
  returning * into selected_job;

  return selected_job;
end;
$$;

revoke all on function public.enqueue_background_job(text, text, jsonb, uuid, integer, integer) from public;
revoke all on function public.claim_background_jobs(integer, integer) from public;
revoke all on function public.complete_background_job(uuid, bigint, jsonb) from public;
revoke all on function public.fail_background_job(uuid, bigint, text, integer) from public;
revoke all on function public.replay_background_job(uuid, integer) from public;

grant execute on function public.enqueue_background_job(text, text, jsonb, uuid, integer, integer) to service_role;
grant execute on function public.claim_background_jobs(integer, integer) to service_role;
grant execute on function public.complete_background_job(uuid, bigint, jsonb) to service_role;
grant execute on function public.fail_background_job(uuid, bigint, text, integer) to service_role;
grant execute on function public.replay_background_job(uuid, integer) to service_role;

-- The job safely does nothing until the two named Vault secrets are configured.
-- Hosted setup instructions live in docs/background-jobs-runbook.md.
select cron.schedule(
  'pull-prix-process-jobs',
  '* * * * *',
  $cron$
    select net.http_post(
      url := secrets.project_url || '/functions/v1/process-jobs',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', secrets.automation_secret_key
      ),
      body := jsonb_build_object('scheduled_at', now())
    )
    from (
      select
        max(decrypted_secret) filter (where name = 'pull_prix_project_url') as project_url,
        max(decrypted_secret) filter (where name = 'pull_prix_automation_secret_key') as automation_secret_key
      from vault.decrypted_secrets
    ) secrets
    where secrets.project_url is not null
      and secrets.automation_secret_key is not null;
  $cron$
);
