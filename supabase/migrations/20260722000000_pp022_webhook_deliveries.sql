-- PP-022 durably accepts each GitHub delivery once and dispatches one stable
-- background job. Event-specific interpretation begins in PP-023.

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  github_delivery_id uuid not null unique,
  event_name text not null check (event_name ~ '^[a-z0-9_]+$'),
  action text,
  github_installation_id bigint,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  background_job_id uuid unique references public.background_jobs(id),
  status text not null default 'received'
    check (status in ('received', 'queued', 'processing', 'processed', 'failed', 'ignored')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index webhook_deliveries_status_idx
  on public.webhook_deliveries (status, received_at desc);

create trigger webhook_deliveries_set_updated_at
before update on public.webhook_deliveries
for each row execute function private.set_updated_at();

alter table public.webhook_deliveries enable row level security;
revoke all on table public.webhook_deliveries from anon, authenticated;

create function private.sync_webhook_delivery_job_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_type = 'github.delivery' then
    update public.webhook_deliveries
    set
      status = case new.status
        when 'processing' then 'processing'
        when 'succeeded' then 'processed'
        when 'failed' then 'failed'
        else 'queued'
      end,
      attempt_count = new.attempt_count,
      last_error = new.last_error,
      processed_at = case
        when new.status = 'succeeded' then coalesce(new.completed_at, now())
        else null
      end
    where background_job_id = new.id;
  end if;

  return new;
end;
$$;

create trigger background_jobs_sync_webhook_delivery
after update of status, attempt_count, last_error, completed_at
on public.background_jobs
for each row execute function private.sync_webhook_delivery_job_status();

revoke all on function private.sync_webhook_delivery_job_status() from public;

create function public.accept_github_delivery(
  p_github_delivery_id uuid,
  p_event_name text,
  p_payload jsonb,
  p_action text default null,
  p_github_installation_id bigint default null
)
returns table (
  delivery_id uuid,
  duplicate boolean,
  delivery_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_delivery public.webhook_deliveries;
  selected_job public.background_jobs;
begin
  if p_event_name is null or p_event_name !~ '^[a-z0-9_]+$' then
    raise exception 'invalid GitHub event name' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'GitHub payload must be an object' using errcode = '22023';
  end if;

  insert into public.webhook_deliveries (
    github_delivery_id,
    event_name,
    action,
    github_installation_id,
    payload
  )
  values (
    p_github_delivery_id,
    p_event_name,
    nullif(btrim(p_action), ''),
    p_github_installation_id,
    p_payload
  )
  on conflict (github_delivery_id) do nothing
  returning * into selected_delivery;

  if selected_delivery.id is null then
    select * into strict selected_delivery
    from public.webhook_deliveries
    where github_delivery_id = p_github_delivery_id;

    return query select selected_delivery.id, true, selected_delivery.status;
    return;
  end if;

  select * into selected_job
  from public.enqueue_background_job(
    p_job_type := 'github.delivery',
    p_idempotency_key := 'github-delivery:' || p_github_delivery_id::text,
    p_payload := jsonb_build_object('delivery_id', selected_delivery.id),
    p_max_attempts := 3
  );

  update public.webhook_deliveries
  set
    background_job_id = selected_job.id,
    status = 'queued'
  where id = selected_delivery.id
  returning * into selected_delivery;

  return query select selected_delivery.id, false, selected_delivery.status;
end;
$$;

create function public.replay_webhook_delivery(
  p_github_delivery_id uuid,
  p_delay_seconds integer default 0
)
returns public.webhook_deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_delivery public.webhook_deliveries;
begin
  select * into selected_delivery
  from public.webhook_deliveries
  where github_delivery_id = p_github_delivery_id
  for update;

  if selected_delivery.id is null then
    raise exception 'webhook delivery not found' using errcode = 'P0002';
  end if;

  perform public.replay_background_job(
    selected_delivery.background_job_id,
    p_delay_seconds
  );

  select * into strict selected_delivery
  from public.webhook_deliveries
  where id = selected_delivery.id;

  return selected_delivery;
end;
$$;

revoke all on function public.accept_github_delivery(uuid, text, jsonb, text, bigint) from public;
revoke all on function public.replay_webhook_delivery(uuid, integer) from public;

grant execute on function public.accept_github_delivery(uuid, text, jsonb, text, bigint) to service_role;
grant execute on function public.replay_webhook_delivery(uuid, integer) to service_role;
