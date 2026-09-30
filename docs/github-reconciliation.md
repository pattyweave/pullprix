# Periodic GitHub reconciliation

Roadmap: PP-036. A daily repair pass using the existing Supabase Cron, queue,
worker, and repository backfill cursor. No new hosting service or dashboard.

## Automatic flow

At **03:17 UTC daily**, `enqueue_github_reconciliation()` queues one
`github.reconcile-installation` job per known, non-deleted installation.
Suspended installations remain eligible so a missed unsuspension can recover.
Pending work is not duplicated; daily keys also make repeat scheduling safe.

Each installation job:

1. Reads the current installation and repository revision from our database.
2. Fetches GitHub's installation state using the app JWT. A missing installation
   (404) is recorded as deleted; suspension is recorded without repository reads.
   Authentication, rate-limit, and server errors fail/retry rather than changing
   access. Deleted installation IDs are terminal; a reinstall has a new ID.
3. For active installations, mints a temporary **metadata-read-only** token and
   lists currently authorized repos. This discovery token is not restricted to
   our stale local repo IDs, so missed repository additions can be discovered.
   It never grants access beyond GitHub's installation scope. Tokens stay in
   memory and are not included in logs, jobs, or database records.
4. Commits installation state and the complete normalized repository snapshot
   atomically. Missed additions, removals, and renames are repaired. A newer
   scope webhook invalidates the snapshot and causes a retry.
5. Starts missing initial imports or reuses completed imports for recent-history
   repair. Running imports keep their cursor; failed imports resume normally.

Repository repair uses at least the last **7 days**, overlapping the previous
successful completion by one day when an outage needs a longer catch-up. The
maximum lookback remains **60 days**. Recently completed runs are not restarted
for 20 hours. Each page uses the existing PP-035 retry/rate-limit behavior.

The app-authenticated installation lookup and installation repository-list
endpoints are documented by GitHub in [Apps](https://docs.github.com/en/rest/apps/apps)
and [Installations](https://docs.github.com/en/rest/apps/installations).

## Review repairs

Missing PRs, formal reviews, and present inline comments follow PP-035's shared
normalization and idempotent canonical writes. Reconciliation can also correct
an existing formal review after a missed edit. Because GitHub does not expose
a review edit timestamp, a webhook written during the API fetch wins; a future
pass can check it again. Corrections mark the PR for scoring recalculation.

Dismissed reviews stay ineffective, including after delayed submitted events.
API snapshots do not fabricate an original review outcome or dismissal actor/date.

## MVP bounds

- Repository discovery is atomic and bounded to 1,000 repos and 40 seconds per
  attempt. An incomplete list, changing total, duplicate IDs, or timeout fails
  without inferring removals. Larger installations need a later paginated
  discovery enhancement, not partial access changes.
- This is eventual repair, not a point-in-time GitHub snapshot. Offset pagination
  can move while repos are busy; overlapping daily passes revisit recent work.
- An entirely unknown installation whose first installation webhook was lost
  still needs the registration runbook's redelivery/setup step. This job refreshes
  known installations; it does not bootstrap every account in the app.
- History outside the bounded lookback, deleted inline comments absent from REST,
  and main-conversation issue comments are not recovered by this ticket. Present
  inline comments and formal-review dismissals are covered.

## Inspect and retry

Founder SQL, using the existing tables:

```sql
select id, payload->>'github_installation_id' as installation, status,
       attempt_count, last_error, result, created_at, completed_at
from public.background_jobs
where job_type = 'github.reconcile-installation'
order by created_at desc;

select r.full_name, b.run_kind, b.status, b.pages_completed,
       b.since_at, b.updated_at, b.last_error
from public.repository_backfills b
join public.repositories r on r.id=b.repository_id;
```

After fixing a failed job's underlying problem:

```sql
select public.replay_background_job('FAILED_JOB_UUID');
```

To run the daily scheduler immediately:

```sql
select public.enqueue_github_reconciliation();
```

For a deliberate sandbox repair test after an import has completed, force a new
repository pass without waiting for tomorrow (server-only, not a customer setting):

```sql
select public.start_repository_reconciliation(164945891, true);
```

One installation/repository's failure does not stop other jobs. Queue retries
honor GitHub rate-limit hints; exhausted attempts remain in the existing ledger.
Team members can read their own repository progress through existing RLS.

## Verification and deployment status — 2026-09-27

- 143 application tests and 429 database assertions pass, including all prior
  ingestion/backfill regressions. Build, lint, and focused worker TypeScript
  checks pass; existing frontend refresh/chunk-size warnings remain.
- A rollback-only database fixture deliberately omits PR/review webhook rows,
  imports their normalized API facts, and verifies recovery without duplicates.
  Further checks cover review corrections, dismissal preservation, scope races,
  tenant isolation, and independent installation jobs.
- Read-only discovery against GitHub confirmed installation `164945891` is active
  and lists only `Pull-Prix/pull-prix-sandbox`. No remote data was changed.
- Following explicit approval, the app ID/private key were configured as hosted
  secrets. Migration `20260927000000` and the updated `process-jobs` are deployed.
  The migration passed a hosted rollback-only check before being applied with
  its ledger entry atomically through the Supabase Management API.
- The hosted daily Cron is active at 03:17 UTC; the existing worker Cron remains
  active every minute. An immediate installation reconciliation succeeded on
  its first attempt: active installation, one repository checked.
- After PP-035 completed, a forced repository reconciliation completed all three
  pages at 06:17:50 UTC. All six page jobs across initial import and repair, plus
  the installation check, succeeded on their first attempts without errors.
- Canonical data remained one merged/closed PR, one effective approved review,
  and two participants. The live check verified API-to-database execution and
  idempotency; deliberately omitted-webhook recovery is covered by the rollback
  fixture above, not by deleting real sandbox facts.

For future repair testing, use a dedicated sandbox event/fixture. Do not delete
real review records just to demonstrate recovery.
