# Next-review recommendations — PP-044

The pure `recommendNextReview` function in
`supabase/functions/_shared/recommendations/v1.ts` chooses at most one safe base
review opportunity. It returns a GitHub URL, PR/repository IDs, age, gate
observation timestamp, and machine-readable reasons with explanations.

Candidates must be open, selected, non-draft, human-authored, ready, and still
need review. Exclude the author, inactive/ineligible participants, prior reviewers,
PRs waiting for author changes, and repositories outside the caller's independently
verified access. Organization membership alone does not establish repository access.
A missing, changed, unknown, satisfied, future, or older-than-five-minutes gate
cannot yield a suggestion. The five-minute value is an internal freshness limit,
not a customer setting. Changes between observation and opening GitHub remain
possible; recommendations do not reserve work or guarantee an award.

Order: aging PRs (>24 elapsed hours), fewer repository useful reviews in the last
seven rolling days, oldest readiness, stable PR ID. These preferences never add
points. With unconfigured requirements, conservatively count lifetime eligible
formal reviewers to enforce the two-reviewer fallback, including pre-entry and
dismissed history without a current-season award. This may omit an opportunity
when old formal activity did not qualify, but it never invents a freed slot.
Follow-through recommendations are not included in this first version.

`get_organization_recommendation_candidates(uuid)` is a service-role-only,
organization-scoped loader. It retains reviewer conflicts, current gate evidence,
repository coverage, and canonical readiness. Dirty scoring state invalidates a
gate. The future product endpoint (PP-060/063) must authorize the participant and
repository access, refresh stale gates through the existing GitHub client, then
call the pure function. No endpoint or UI is exposed by PP-044.

Validation on 2026-09-28: 289 application tests, 539 database assertions, focused
TypeScript checks, and the existing scoring integration bridge pass. Migration
`20260928040000_pp044_recommendation_input.sql` deployed. Live sandbox returned
one open candidate and no self-review recommendation for its author. No canonical
scores changed, and no GitHub messages or reviews were submitted.
