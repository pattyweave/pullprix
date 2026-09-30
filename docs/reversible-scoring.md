# Reversible scoring — PP-041

The existing once-per-minute `process-jobs` worker now calls the PP-040 engine
and persists its result. No new service, paid infrastructure, or manager setting.
Landing-page/demo data is unchanged; private standings are PP-042.

## Data flow

1. Canonical PR/review/feedback/eligibility changes increment a PR revision.
2. The worker queues one `scoring.pull-request` job per dirty PR. Jobs share the
   existing queue, retry handling, and service-key authentication.
3. The worker applies known corrections immediately, then fetches complete
   review/comment lists and a current GitHub review-gate observation.
4. The engine recomputes the entire PR lifetime, projected into every affected
   first-Monday-at-12:00-UTC season, including older seasons.
5. One transaction checks the input revision and applies component differences.
   A concurrent webhook makes an old result stale, not authoritative.

`score_components` holds stable base/follow-through/rescue slots, with effective
or reversed status and the full source/explanation. `score_component_changes`
records before/after values and point deltas **only when something changes**.
Totals are sums of effective components, never an independently incremented
counter. Canonical facts are retained after dismissal/deletion.

`pull_request_scoring` stores the input/computed revisions, history-check time,
and per-review decisions. Unknown context is `pending`, not a zero-point result.
Previously earned unresolved components are retained. Every approval dismissal
preserves earned credit, while ineligible actors/authors, deleted reviews, and
deleted qualifying feedback can still reverse or
reduce scores. All scoring tables/RPCs are server-only until the private
standings read API is implemented.

## Evidence, not current-state guesses

- Processed signed PR/review deliveries produce compact `scoring_events`:
  readiness transitions, submitted-review state, and `synchronize` head SHAs.
  Dismissals use the stored webhook `received_at` as their observation time:
  GitHub does not provide a dismissal timestamp, and PR `updated_at` can still
  equal the original approval submission. Canonical `dismissed_at` and
  `superseded_at` use this same receipt observation; they are not claims about
  the exact GitHub action time. Original review submission time is unchanged.
  No source code or comment body is copied into scoring metadata.
- `repository_scoring_access` retains authorization intervals across removal,
  re-addition, and installation suspension. Existing repositories start from
  their last observed access boundary; the migration does not invent an older
  original authorization date.
- Participant scoring start uses the earliest canonical activity as well as
  the existing roster join timestamp, so out-of-order discovery is handled.
- GitHub API history enrichment reuses the canonical normalizers. Only complete
  lists can establish deletion by absence. Newer webhook facts win over stale
  fetches. Review/comment pages are bounded to 100 each per scoring attempt;
  larger histories remain pending rather than being silently truncated.
- `review_gate_observations` records current GitHub review decisions, head SHA,
  latest submitted review, and observation time. A review only uses a matching
  observation **before** its submission, without an intervening relevant PR or
  review change. A post-approval “satisfied” result never disqualifies the
  approval that satisfied the gate.
- Unconfigured fallback requires verification of both classic branch protection
  and active branch rules. Permission failures/nulls are not proof of no rules.
  GitHub's explicit Free/private-repository feature-unavailable response is
  handled as unavailable rulesets, but only after classic review requirements
  have also been ruled out. Generic 403s and rate limits stay unknown/errors.
  See [GitHub ruleset availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets).
  GitHub `reviewDecision` can establish enforced open/closed credit even when
  unrelated branch fields are inaccessible.

Historical reviews without a prior gate observation ordinarily stay pending.
PP-086 adds one explicit initial-check fallback: a new, unchanged PR whose first
check confirms no requirements within five minutes of opening can use the
two-reviewer cap. The loader supplies separate `initialUnconfiguredObservation`
evidence and leaves historical credit unknown. It never backdates observations.
This does not cover enforced/unreadable rules or older imports. For example,
the sandbox PR reviewed before PP-041 cannot be awarded retroactively using a
rule lookup made today. A different head SHA without a retained synchronize
event also does not manufacture a follow-through bonus.

Gate observations describe what GitHub exposed when observed, not a complete
audit of out-of-band branch-rule changes. The MVP does not reconstruct missing
historical rules or make up policy state from approval counts. Recheck this
limitation before supporting teams frequently changing rules mid-PR.

## GitHub permission and first live award

For fallback verification, GitHub requires **Contents: Read-only** to expose
base-branch metadata ([GitHub's branch API permissions](https://docs.github.com/en/rest/branches/branches#get-a-branch)). That permission technically permits code reads; this
implementation only calls PR/review/comment, GraphQL metadata, branch metadata,
and branch-rule endpoints. It never requests blobs, trees, file contents, or diffs.

After changing the app permission, approve the installation update. A fresh
installation token must reflect it (redeploy the worker if an older token is
still cached). Then:

1. Open a **new**, non-draft sandbox PR after the permission is active.
2. Let its opening webhook and scoring job finish before submitting a review
   (normally about a minute). This captures the pre-review gate.
3. Submit one approval from another human account. Expect an 8-point base,
   or 10 if that formal review includes qualifying feedback. An ordinary PR
   conversation comment is still not a formal review.
4. Check `score_components`, `score_component_changes`, and
   `pull_request_scoring.decisions`. Replay/recompute must not add a second award.
5. Dismiss that approval; its **earned points must remain** while canonical
   GitHub approval validity becomes false. This covers both automatic and manual
   dismissal. Repeated approvals cannot earn another base. Deleting a review or
   discovering an eligibility violation can still reverse points; merging alone
   must not.

## Recompute and verification

Service-role/founder SQL only:

```sql
-- One PR, or omit the argument for every PR. Existing worker drains the work.
select public.request_score_recomputation('PR_UUID'::uuid);
select public.request_score_recomputation();
select public.enqueue_scoring_jobs();

select status, decisions from public.pull_request_scoring;
select season_id, participant_id, sum(points)
from public.score_components where status = 'effective'
group by season_id, participant_id;
```

Run `npm test`, `npm run supabase:test-db`, and
`npm run supabase:test-scoring` with local Supabase running. The last command
tests the actual SQL loader → TypeScript engine → SQL ledger: +8, identical
replay, dismissal keeps 8, deletion reverses 8, audit sum zero. All fixture work
is rolled back. The bridge also reproduces unchanged PR `updated_at`, checks
new dismissal event capture, and repairs legacy timestamps through the actual
migration before requiring complete scoring and one unchanged award.

Validation on 2026-09-27: 213 application tests, 477 database assertions,
the scoring bridge, focused TypeScript checks, production build, and lint pass.
Existing frontend refresh/chunk-size warnings remain unchanged.

Hosted migration and worker deployment succeeded. The existing minute cron
processed the sandbox PR: one canonical PR/review preserved, three retained
events, one gate observation, and no unsupported awards or adjustments. Its
review is explicitly `credit_unknown`, as expected for pre-PP-041 history.
On 2026-09-28, the token provider was corrected to request the approved Contents
read permission, and the explicit GitHub Free-plan rules response was handled
without mistaking generic permission errors for no rules. The real sandbox now
returns `unconfigured`. The fresh-PR award and dismissal-retention test passed
as recorded below.

The 2026-09-28 clarification is implemented in
`20260928000000_pp041_dismissed_approval_credit.sql`: preserve known original
approvals across every dismissal without changing canonical GitHub validity.
Deletion detected after dismissal still removes eligibility for scoring.
Validation: 224 application tests, 492 database assertions, the revised real
database/engine/ledger bridge, focused TypeScript checks, and lint pass.
The clarified-policy migration and updated worker were deployed successfully
on 2026-09-28.

Final live verification — 2026-09-28:

- Sandbox [PR #2](https://github.com/Pull-Prix/pull-prix-sandbox/pull/2),
  `59c5e7ac-7911-4eea-8d72-e8c2647e0760`: scoring `complete` at
  revision/computed revision **14**, decision `scored`, **8 points**.
- Review `5343385337` retains original `approved` work history and canonical
  `effective=false` with dismissal metadata. One effective component and one
  award adjustment remain; no duplicate or reversal was created.
- Approval submission remains `19:05:59Z`. Dismissal observation is corrected
  to stored receipt `19:08:21.786502Z`, preserving the `18:58:02.619Z` pre-review
  `unconfigured` gate. The old PR snapshot had reused the approval timestamp.
- New migration `20260928010000_pp041_dismissal_observation_time.sql` and worker
  deployed successfully. The existing minute worker recomputed the repaired
  evidence normally; no forced completion or new infrastructure.
- 225 application tests, 492 database assertions, focused TypeScript checks,
  and the SQL → engine → ledger regression pass. The regression verifies
  receipt-time capture, legacy repair, complete scoring, idempotent eight-point
  retention, and deletion reversal.

PP-041 is complete. PP-042 remains backlog.
