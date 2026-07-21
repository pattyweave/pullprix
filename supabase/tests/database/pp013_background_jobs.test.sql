begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

select has_extension('pgmq', 'pgmq extension is enabled');
select has_extension('pg_cron', 'pg_cron extension is enabled');
select has_extension('pg_net', 'pg_net extension is enabled');
select has_table('public', 'background_jobs', 'background jobs ledger exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.background_jobs'::regclass),
  'background jobs has RLS enabled'
);
select is(
  (select count(*) from cron.job where jobname = 'pull-prix-process-jobs'),
  1::bigint,
  'one minute consumer Cron job exists'
);
select is(
  (select schedule from cron.job where jobname = 'pull-prix-process-jobs'),
  '* * * * *',
  'consumer Cron job runs every minute'
);
select ok(
  (select command like '%/functions/v1/process-jobs%' from cron.job where jobname = 'pull-prix-process-jobs'),
  'Cron invokes the bounded Edge Function'
);
select ok(
  (select command like '%vault.decrypted_secrets%' from cron.job where jobname = 'pull-prix-process-jobs'),
  'Cron reads credentials from Vault'
);
select ok(
  (select command not like '%sb_secret_%' and command not like '%service_role%' from cron.job where jobname = 'pull-prix-process-jobs'),
  'Cron migration contains no credential value'
);
select is(
  (select queue_length from pgmq.metrics('pull_prix_jobs')),
  0::bigint,
  'job queue begins empty'
);

create temporary table first_enqueue as
select * from public.enqueue_background_job(
  p_job_type := 'backfill.repository-page',
  p_idempotency_key := 'backfill:repo-1:start',
  p_payload := '{"repository_id":"repo-1","cursor":"cursor-1","page":1}'::jsonb,
  p_max_attempts := 2
);

create temporary table duplicate_enqueue as
select * from public.enqueue_background_job(
  p_job_type := 'backfill.repository-page',
  p_idempotency_key := 'backfill:repo-1:start',
  p_payload := '{"repository_id":"repo-1","cursor":"cursor-1","page":1}'::jsonb,
  p_max_attempts := 2
);

select is(
  (select id from duplicate_enqueue),
  (select id from first_enqueue),
  'duplicate enqueue returns the existing job'
);
select is(
  (select count(*) from public.background_jobs where idempotency_key = 'backfill:repo-1:start'),
  1::bigint,
  'duplicate enqueue creates one ledger record'
);
select is(
  (select queue_length from pgmq.metrics('pull_prix_jobs')),
  1::bigint,
  'duplicate enqueue creates one queue message'
);
select throws_ok(
  $$select public.enqueue_background_job(
    p_job_type := 'backfill.repository-page',
    p_idempotency_key := 'backfill:repo-1:start',
    p_payload := '{"repository_id":"different-repo"}'::jsonb
  )$$,
  '22023',
  'idempotency key already belongs to different job parameters',
  'an idempotency key cannot alias different work'
);

create temporary table first_claim as
select * from public.claim_background_jobs(1, 30);

select is((select count(*) from first_claim), 1::bigint, 'consumer claims one queued job');
select is((select attempt_count from first_claim), 1, 'first claim records attempt one');
select is(
  (select payload->>'cursor' from first_claim),
  'cursor-1',
  'backfill cursor survives queue claim'
);
select is(
  public.fail_background_job(
    (select job_id from first_claim),
    (select queue_message_id from first_claim),
    'temporary GitHub failure',
    0
  ),
  'retrying',
  'a retryable failure returns the job to the queue'
);
select is(
  (select status from public.background_jobs where id = (select job_id from first_claim)),
  'retrying',
  'retry state is visible in the ledger'
);

-- Avoid a clock-boundary race inside this single test transaction. Production
-- retries use PGMQ's visibility timestamp set by fail_background_job.
update pgmq.q_pull_prix_jobs
set vt = clock_timestamp() - interval '1 second'
where msg_id = (select queue_message_id from first_claim);

create temporary table second_claim as
select * from public.claim_background_jobs(1, 30);

select is((select attempt_count from second_claim), 2, 'second claim increments the attempt count');
select is(
  public.fail_background_job(
    (select job_id from second_claim),
    (select queue_message_id from second_claim),
    'permanent GitHub failure',
    0
  ),
  'failed',
  'the final allowed attempt marks the job failed'
);
select is(
  (select count(*) from public.background_jobs where status = 'failed' and last_error = 'permanent GitHub failure'),
  1::bigint,
  'operators can identify a failed job and its concise error'
);
select is(
  (select queue_length from pgmq.metrics('pull_prix_jobs')),
  0::bigint,
  'failed job leaves the active queue'
);

create temporary table replayed_job as
select * from public.replay_background_job((select job_id from second_claim));

select is(
  (select id from replayed_job),
  (select job_id from second_claim),
  'replay preserves the stable job identity'
);
select is(
  (select status from replayed_job),
  'queued',
  'replay queues the failed job again'
);

update pgmq.q_pull_prix_jobs
set vt = clock_timestamp() - interval '1 second'
where msg_id = (select queue_message_id from replayed_job);

create temporary table replay_claim as
select * from public.claim_background_jobs(1, 30);

select ok(
  public.complete_background_job(
    (select job_id from replay_claim),
    (select queue_message_id from replay_claim),
    '{"pages_processed":1}'::jsonb
  ),
  'a replayed job can complete'
);
select is(
  (select status from public.background_jobs where id = (select job_id from replay_claim)),
  'succeeded',
  'completed state is durable'
);
select is(
  (select result->>'pages_processed' from public.background_jobs where id = (select job_id from replay_claim)),
  '1',
  'completed result is recorded once'
);
select is(
  public.complete_background_job(
    (select job_id from replay_claim),
    (select queue_message_id from replay_claim),
    '{"pages_processed":999}'::jsonb
  ),
  false,
  'duplicate completion cannot apply another result'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select count(*) from public.background_jobs$$,
  '42501',
  'permission denied for table background_jobs',
  'browser users cannot inspect background jobs'
);
select throws_ok(
  $$select public.enqueue_background_job('system.noop', 'browser:forbidden')$$,
  '42501',
  'permission denied for function enqueue_background_job',
  'browser users cannot enqueue work'
);

select * from finish();
rollback;
