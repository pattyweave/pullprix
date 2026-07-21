# Background Jobs Runbook

Roadmap ticket: `PP-013`

Pull Prix uses one durable Supabase Queue named `pull_prix_jobs`. PostgreSQL
stores the authoritative job record in `public.background_jobs`; the queue
message contains only its ID and envelope version.

## Hosted setup

Deploy the `process-jobs` Edge Function, create a named Supabase secret API key
called `automations`, and store the function URL and that key in Vault:

```sql
select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'pull_prix_project_url'
);

select vault.create_secret(
  'YOUR_AUTOMATIONS_SECRET_KEY',
  'pull_prix_automation_secret_key'
);
```

The committed Cron job runs every minute. It safely makes no request until both
Vault values exist. The key must also be available to the function as the named
`automations` entry in `SUPABASE_SECRET_KEYS`; local Supabase uses its injected
`SUPABASE_SECRET_KEY` fallback.

## Enqueue work

Only trusted Edge Functions or founder SQL may invoke the enqueue function:

```sql
select * from public.enqueue_background_job(
  p_job_type := 'backfill.repository-page',
  p_idempotency_key := 'backfill:REPOSITORY_ID:CURSOR_OR_START',
  p_payload := jsonb_build_object(
    'repository_id', 'REPOSITORY_ID',
    'cursor', null,
    'page', 1
  ),
  p_organization_id := 'ORGANIZATION_ID',
  p_max_attempts := 3
);
```

Use one job per bounded API page. A successful page processor enqueues the next
cursor with a new deterministic idempotency key. A retry keeps the same payload
and cursor, so a function timeout never restarts the entire backfill.

Calling enqueue repeatedly with the same key and parameters returns the
existing job and does not create another queue message. Reusing a key for
different parameters fails.

## Inspect failures

Run this in the protected Supabase SQL editor:

```sql
select
  id,
  organization_id,
  job_type,
  idempotency_key,
  attempt_count,
  max_attempts,
  last_error,
  failed_at
from public.background_jobs
where status = 'failed'
order by failed_at desc;
```

Job payloads and queue tables are not browser-readable.

## Replay one failed job

Correct the underlying cause first, then reuse the existing job identity:

```sql
select * from public.replay_background_job('FAILED_JOB_ID');
```

Replay is accepted only for a failed job. It creates a new queue message while
preserving the original job ID and idempotency key. This makes downstream
handlers responsible for one stable job identity across retries and founder
replays.
