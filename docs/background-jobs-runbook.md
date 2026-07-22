# Background Jobs Runbook

Roadmap tickets: `PP-013`, `PP-014`, `PP-022`, `PP-023`, `PP-024`

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

## Inspect function logs

Use the Supabase `process-jobs` function log view and search for one of these
events:

- `background_job_failed`
- `background_job_batch_failed`
- `background_job_succeeded`

Job events include only `job_id`, `job_type`, and attempt number. Search the
failed-jobs query above for the same `job_id` to find its organization and
concise stored error. Logs intentionally omit payloads, exception text, API
responses, tokens, and secrets.

GitHub webhook jobs use `github-delivery:GITHUB_DELIVERY_ID` as their stable
idempotency key. Inspect a delivery and its linked job without exposing payloads
to browser clients:

```sql
select
  delivery.github_delivery_id,
  delivery.event_name,
  delivery.action,
  delivery.github_installation_id,
  delivery.status,
  delivery.attempt_count,
  delivery.last_error,
  delivery.received_at,
  delivery.processed_at,
  delivery.background_job_id
from public.webhook_deliveries delivery
order by delivery.received_at desc;
```

The delivery row automatically follows its linked job through queued,
processing, processed, and failed states. Raw payloads remain available in the
protected SQL editor for founder debugging and later event processing, but are
never browser-readable.

For local inspection, run `npm run supabase:functions`, enqueue an unsupported
test job, and invoke `process-jobs`. The JSON failure event appears directly in
that terminal. No dashboard or external log service is part of the MVP.

## Replay one failed job

Correct the underlying cause first, then reuse the existing job identity:

```sql
select * from public.replay_background_job('FAILED_JOB_ID');
```

Replay is accepted only for a failed job. It creates a new queue message while
preserving the original job ID and idempotency key. This makes downstream
handlers responsible for one stable job identity across retries and founder
replays.

For a failed GitHub delivery, replay by GitHub's delivery ID instead. This
reuses both the delivery and background-job identities:

```sql
select * from public.replay_webhook_delivery('GITHUB_DELIVERY_ID');
```

## Inspect installation access

Installation lifecycle processing recognizes created, new-permissions,
suspend, unsuspend, delete, and account-rename events. GitHub's installation
`updated_at` value prevents an older delivery from replacing newer state.

```sql
select
  github_installation_id,
  account_login,
  status,
  last_lifecycle_action,
  github_updated_at
from public.github_installations
order by updated_at desc;
```

Only `active` installations may perform later ingestion or GitHub API work.
Suspended and deleted installations remain as tombstones so delayed deliveries
cannot reactivate them. PP-081 owns permanent customer-data deletion; PP-023
only enters that workflow by recording the deleted state.

## Inspect repository eligibility

Repository access is event-derived and requires no team configuration:

```sql
select
  installation.github_installation_id,
  installation.repository_selection,
  repository.github_repository_id,
  repository.full_name,
  repository.active,
  repository.access_updated_at
from public.repositories repository
join public.github_installations installation
  on installation.id = repository.installation_id
order by repository.updated_at desc;
```

Only active repositories under an active installation are eligible for new
ingestion and backfill. Removal and transfer deactivate a row instead of
deleting it, preserving historical team records. If a transferred repository
is later granted to another installation, that installation receives its own
row; data is never moved between organizations.

For an `all` installation, repository-created events add newly created
repositories. PP-025's installation-token work will provide the API access used
by later backfill and reconciliation tickets; PP-024 makes no GitHub API calls.
