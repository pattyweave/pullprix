# Initial repository backfill

Roadmap: PP-035. Uses the existing Supabase queue, worker, and free-tier database.

## What happens automatically

Installation and repository-scope deliveries start one import per active repo.
The import lists PRs updated in the last 60 days (open, closed, or merged), then
their submitted formal reviews and inline review comments. Pending reviews and
main-conversation issue comments are not imported. The cutoff is fixed when
the run starts, not recalculated on every retry.

Each job fetches one API page of at most 20 records. PR pages are ordered by
latest update; the import stops once it reaches older history. Reviews and
inline comments for those PRs use the same normalizers and canonical tables as
webhook events. These are facts, not points; PP-040 owns scoring.

PR authors and formal reviewers use the PP-034 activity-derived roster rules.
Old activity may retain an identity without adding a standings participant.
Inline commenters alone do not join the roster. Importing history does not
grant authentication or organization membership.

## Progress and recovery

`repository_backfills` stores status, pages completed, last error, timestamps,
and a small cursor. Authenticated team members can read their organization's
progress through RLS; only the server can change it. The manager-facing display
belongs to the later onboarding/team UI tickets (PP-050/PP-051/PP-064), not a
new operations dashboard in this ticket. No misleading percentage is shown:
GitHub does not supply a reliable total page count for the complete import.

Founder inspection:

```sql
select r.full_name, b.status, b.pages_completed, b.cursor->>'phase' as phase,
       b.last_error, b.started_at, b.updated_at, b.completed_at
from public.repository_backfills b
join public.repositories r on r.id = b.repository_id;
```

For an installation already present before PP-035, or after fixing a failed
repo's permissions/credentials, run:

```sql
select public.start_installation_backfills(164945891);
```

Use the relevant installation ID outside the sandbox. Repeating this call does
not restart completed imports or duplicate running ones. Failed jobs resume
their saved cursor; restored access resumes cancelled imports with a new run
identity so old queued jobs become harmless. Scope is checked before API reads
and again before committing facts.

The page's facts, next cursor, and next queued job commit in one transaction.
Duplicate/late page attempts cannot advance an already-advanced cursor. Each
repo has its own job chain, so another repo's failure does not stop it.

The worker claims one job at a time with a 120-second visibility window, up to
10 jobs or 40 seconds between claims per invocation. The existing minute Cron
continues remaining work. GitHub rate-limit retry headers feed the existing
retry policy (delay capped at one hour); exhausted retries remain visible and
can be replayed without discarding progress.

## Data ordering and limits

- PR and inline-comment writes retain their existing stale-event guards.
- During initial imports, existing formal-review facts win over API snapshots.
  PP-036 reconciliation can correct older facts while preserving webhook writes
  received during the fetch; see `github-reconciliation.md`.
- A dismissed API review is ineffective. GitHub REST does not reveal its
  original outcome or dismissal actor/time: we retain the observed dismissed
  state and observation time, without fabricating those missing facts. A late
  submitted/edited webhook cannot reactivate it.
- Cursors contain only PR IDs/numbers/timestamps and minimal author identity;
  they do not retain PR/review bodies or source-code diffs. No synthetic webhook
  rows are created for API reads.
- This is a bounded initial import, not a point-in-time GitHub snapshot. Busy
  repos can shift GitHub's offset pagination while importing; live webhooks
  continue normally, and PP-036 provides periodic recent-history reconciliation.
- Historical draft-to-ready transition timing is unavailable from these REST
  snapshots; lifecycle timestamps have the existing PP-030 approximation.

## Verification

Local checks cover pagination, cutoff, shared normalization, dismissed reviews,
API errors, retry delays, idempotency, transactional rollback, roster resolution,
scope revocation/restoration, independent repos, and tenant read restrictions.
Run `npm test` and `npm run supabase:test-db`.

2026-09-26 verification: 135 application tests and 391 database assertions pass;
focused worker TypeScript checks, production build, and lint pass (existing
frontend refresh/chunk-size warnings remain). Migration `20260926000000` and
`process-jobs` are deployed to the development project. The CLI database push
stalled on macOS Keychain; the migration was validated with a rollback-only
transaction, then applied with its ledger entry atomically through the Supabase
Management API.

On 2026-09-27, after explicit user approval, the local app ID/private key were
uploaded to hosted function secrets (no other secrets changed). The live initial
import for installation `164945891`, `Pull-Prix/pull-prix-sandbox`, completed at
06:16:02 UTC through the existing scheduled worker. All three pages (PRs,
reviews, comments) succeeded on their first attempt with no errors.

The follow-up reconciliation also completed successfully. Canonical counts
remained one PR, one effective approved review, and two participants; the PR
remained closed/merged. No fake webhooks were created and no existing facts
were deleted for the test. The run's current progress row now describes the
subsequent reconciliation; the initial page results remain in `background_jobs`.
