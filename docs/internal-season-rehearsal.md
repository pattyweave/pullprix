# PP-086 — Internal season rehearsal evidence

Date: 2026-09-29. Status: IN PROGRESS; independent checks complete, live user
journey and timing acceptance still open. No customer invitation was sent and no
real installation was uninstalled or deleted. No hosted score was rewritten.
Recommendations remain deferred under the approved lean MVP scope.

## Reproducible automated evidence

- `npm test`: 444 application tests pass across 46 files.
- `npm run supabase:test-db`: 664 assertions pass across 26 database files.
- `npm run supabase:test-scoring`: actual SQL loader -> scoring engine -> SQL
  ledger, +8 approval, idempotent replay, dismissal retains 8, deletion reverses
  8. Standings/streaks and health read models checked. Fixtures roll back.
- `npm run supabase:test-season`: new combined SQL -> TypeScript scoring ->
  TypeScript archive -> SQL commit -> authenticated history RPC -> later ledger
  correction -> uninstall -> purge -> suppressed late webhook. Saved result
  stays at 8 points with one champion; later canonical points cannot rewrite it.
  Next calendar season activates independently. All data and tombstones roll back.
- Production build and lint pass (existing bundle-size/Fast Refresh warnings).

Both bridge commands require the dedicated local Docker database. Do not reset
it to run a test. The season rehearsal refuses a database containing existing
organizations. It models a July season and the roster that existed at that time;
the real 60-day discovery rule intentionally cannot create that roster from old
replayed activity today. Separate existing tests cover current roster discovery.
This rehearsal directly invokes database RPCs; it does not impersonate a real
GitHub webhook delivery, perform OAuth, or certify browser rendering.

## Read-only hosted evidence

Project: `tfniygqihihmcuitydde`.

- Latest migrations: PP-081 `20260929010000`, PP-070 `20260929000000`.
- One active organization; effective sandbox ledger still totals 8 points.
- 43 background jobs succeeded; no other job statuses in the audited ledger.
- Both minute processing and daily reconciliation schedules enabled. Last three
  cron dispatch runs succeeded. Dispatch success alone is not worker completion.
- Repository reconciliation completed at 2026-09-29 03:17:07 UTC.
- Pending PR #1 has computed revision equal to source revision (9) and reason
  `credit_unknown`. This is the known pre-review evidence gap, not queued work.
  Do not invent a historical gate decision. If relevant to an ending season, this
  legitimately holds finalization open until resolved through an evidence-based
  support decision. Use a fresh disposable test installation for the live finale
  check rather than disguising this sandbox limitation.
- Hosted product API denies unauthenticated current/archive reads with 401
  `sign_in_again`; untrusted-origin history read gets 403 `origin_denied`.
  Only the public publishable key was used; no real user's token was extracted.

The latest five processed webhook latencies were approximately 8.25s, 39.02s,
10.13s, 3.52s and 12.46s. The 10.13s event was the submitted review; 39.02s was
its dismissal. Across all 15 retained processed deliveries, p95 was 1267.93s
(about 21 minutes), including earlier development-era events. We have not proven
that distribution's cause. These are receive-to-processed timings, not
review-to-visible-dashboard timings. No blanket under-one-minute claim is made.
The minute worker plus frontend polling can also exceed that target depending
on timing; measure the full path before accepting this criterion.

## Acceptance matrix

### September 30 live rehearsal: fast approval evidence gap

The outside organization Piss-Boys-Studio installed successfully (installation
166282661). The user confirmed setup works after refreshing. Vercel production
deploys from master; no production push or callback cutover was performed.

PR https://github.com/Piss-Boys-Studio/piss-boys-website/pull/1 received approval
5370289152 from williamsaintweaver at 18:21:34 UTC. The review webhook arrived
18:21:35.616772 and processed 18:22:01.159153 (25.54 seconds after receipt).
Both pattyweave and williamsaintweaver are active, eligible roster participants.
Scoring source and computed revisions both equal 7, but the decision is pending
`credit_unknown`, with zero awarded points.

The only gate observation is `unconfigured` at 18:22:03.758, after the approval,
and already references that review. The PR-open webhook arrived 18:21:04.187881
but was not processed until 18:22:00.753195. Thus a fast approval can precede the
first requirements observation even during normal minute-worker operation.
This is a live product limitation, not merely an old backfill artifact. Do not
backdate the observation or treat current requirements as historical evidence.
The under-one-minute scoring acceptance criterion remains unmet. A fresh PR
with a confirmed pre-approval observation can test the remaining happy path;
handling fast approvals needed the resolution below.

### September 30 resolution: initial no-requirements fallback

Deployed migration `20260930000000_pp086_initial_review_fallback.sql` and
process-jobs. The first check of a newly opened, unchanged PR can authorize the
existing two-reviewer fallback if it confirms no enforced requirements within
five minutes of opening. Historical credit remains unknown; separate evidence
and component creditBasis retain the actual observation time. This is an
explicit policy clarification, not reconstructed historical rules. Enforced or
unreadable requirements, older imports, missing opening evidence, mismatched
heads/history, and intervening PR edits do not qualify.

Hosted rehearsal PR #1 recomputed successfully at 19:04:02.994874 UTC:
status complete, revision/computed revision 9, 10 effective points for an approval
with feedback. The first observation at 18:22:03.758 was 63.758 seconds after PR
creation, and satisfies the new policy. No synthetic facts or manual ledger
awards were inserted. The worker performed normal recomputation.

449 app tests and 677 database assertions pass. Both original and fast-review
SQL-to-engine-to-ledger bridges verify one award, idempotence, dismissal retention
and deletion reversal. The full season/archive/deletion bridge, build and lint
also pass (existing warnings). Browser confirmation and a fresh timed review
remain necessary; repairing this old attempt does not pass the latency target.

| Criterion | Verified | Still required |
| --- | --- | --- |
| Manager setup under five minutes | Prior session reached the real imported team; setup/auth tests pass | Time a fresh owner install/login/return on the intended hosted URL, separating GitHub approval and import waits |
| Review visible under one minute | Real retained submitted webhook processed in 10.13s; healthy queue; engine and frontend tests pass | Submit one legitimate qualifying review as a second human account and measure through dashboard appearance |
| No duplicate credit; dismissal retains points | Real SQL/engine integration plus existing regressions | Confirm during the live scenario if a real duplicate delivery is replayed by the operator |
| Season completion remains readable | Combined scored fixture finalizes, authenticated history reads it, later ledger mutation leaves it frozen | Visual history smoke test on a disposable installation once its season ends; no global clock or sandbox history manipulation |
| Uninstall stops processing and deletes | Combined lifecycle/purge test, foreign-key cascades, late-event suppression and permissions tests | Uninstall a disposable GitHub App installation, observe worker purge and confirm no subsequent collection |
| Tenant/session access | SQL and app regressions; hosted unauthenticated/origin denial | Owner, eligible developer and denied account browser smoke test with their own sessions |

## Where Patrick is needed

1. Hosting: name the frontend hosting provider and intended HTTPS URL (for
   example, app.pullprix.com versus pullprix.com), and provide access through the
   normal account/connector flow. Do not paste tokens into chat. Codex can then
   prepare/deploy SPA routing, public configuration and coordinated callbacks.
2. GitHub settings: with the owner account, confirm an app installation arrangement
   that permits the outside pilot organization. Current Dev registration is
   private to its owning organization. Also approve any requested GitHub/Supabase
   dashboard changes that require account access.
3. Live rehearsal: use a disposable installation/repository and a second human
   account. Time fresh installation, perform a legitimate review, view the
   dashboard, check another account's permissions, and later uninstall the
   disposable installation. Never use the existing sandbox as an implicit
   deletion target. Codex can inspect backend results as each action happens.

Email aliases and company formation do not block these independent checks. Before
external invitations, confirm the policy's actual legal operator, hosting/log
retention disclosures, and the agreed reachable pilot contact. Keep the existing
founder-contact wording until aliases are genuinely monitored.

The browser tool's prior localhost-policy block remains in effect; no alternate
browser or network route was used to circumvent it. User-performed browser
checks are the remaining visual evidence. The local pilot guide URL is
http://127.0.0.1:5173/pilot (the earlier chat link had a host typo).
