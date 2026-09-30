# Scoring engine v1

PP-040 implements the approved [scoring philosophy](scoring-philosophy.md) as a
pure server-side module: `supabase/functions/_shared/scoring/v1.ts`.

Call `scorePullRequestV1(input)` with one PR's canonical review history and
event-time scoring context. It returns explainable **desired score components**,
per-review decisions, and participant totals for the requested season. It does
not write a ledger, clear recalculation markers, call GitHub, change the demo,
or derive standings. PP-041 owns persistence/reversals and worker wiring;
PP-042 owns standings.

## Rules implemented

- Approval: 8; approval with feedback: 10; comment-only formal review with
  feedback: 10; changes requested: 12.
- One base per reviewer per PR, from their first qualifying review. Later
  submissions do not upgrade that base. An edit of the same canonical review
  can change its single component when recomputed.
- Own nonempty, effective inline feedback linked to the review qualifies just
  like a summary. Comments do not earn individual points or stack bonuses.
- One +4 follow-through per reviewer/PR: a later formal qualifying review,
  credit still open, a different reviewed commit, and a recorded PR head change
  after the base review and no later than the returning review. A different SHA
  by itself is not proof of a push after the first review.
- One +3 rescue per PR, on its **first qualifying review**, strictly more than
  24 continuous ready hours later. A PR already reviewed promptly does not earn
  a rescue merely because a later reviewer arrives after 24 hours. Draft time,
  later comments, and close/reopen cycles cannot manufacture extra rescues.
- `required` is credit open; `satisfied` is closed **before** the review. This
  means an approval that satisfies GitHub's requirement can itself score.
  `unconfigured` uses the first two unique eligible reviewers; `unknown` is
  pending, never silently treated as unconfigured. If requirements reopen,
  lifetime base/follow-through caps still apply.
- Explicit initial-check exception: `initialUnconfiguredObservation` permits the
  same capped fallback for a new, unchanged PR first checked within five minutes
  of opening. Historical credit remains `unknown`; awarded components record
  `creditBasis.kind=initial_unconfigured` and the real observation timestamp.
  The SQL loader verifies first-check status, opening evidence, matching head and
  review history, and absence of intervening changes. The engine independently
  checks the time/head bounds and all ordinary eligibility and lifetime caps.
- Self-review, excluded reviewers/authors, deleted/ineligible reviews, draft
  or already-closed PR activity, and empty comment-only reviews earn nothing.
- Every dismissal of a previously known approval preserves earned work credit.
  `approvalDismissed` carries this evidence separately from GitHub `effective`.
  It never reactivates GitHub approval validity, invents an unknown original
  outcome, or resets base/fallback/rescue/follow-through caps. Deletion and
  independent eligibility corrections still reverse credit.
- Season projection uses `[startsAt, endsAt)` and the activity timestamp, not
  processing time. Organization entry, repository access periods, participant
  scoring start, and departure are respected. Later repository removal or PR
  closure does not erase points earned while eligible.
- No size, speed, streak, diversity, or coverage points. These are not hidden
  configuration options or theme modifiers.

Review opportunities are resolved against the complete PR history **before**
projection into a season/access window. A season reset or late installation
cannot re-award an old base or reset the fallback/rescue caps. Historical work
does not receive retroactive points. A returning reviewer may still earn an
unused follow-through from genuinely new eligible work.

For fallback PRs the maximum is 35 points total: two 12-point bases, two
4-point follow-throughs, and one 3-point rescue. With enforced GitHub rules,
the number of necessary reviewers comes from GitHub, not an artificial cap of
two. Each reviewer remains capped at one base and one follow-through.

## Determinism and explanations

No wall clock, random IDs, network requests, database calls, or theme state are
used. Timestamps require explicit timezones. Reviews are ordered by occurrence
time then GitHub review ID for equal timestamps; input array order is irrelevant.
This is event ordering, not a standings tie-breaker.

Identical duplicate facts collapse. Conflicting versions of the same identity
are rejected: the caller must supply the canonical version, not a delivery bag.
The function never mutates inputs. `SCORING_POLICY_V1` is frozen, and unsupported
policy versions fail explicitly rather than silently using v1.

Each component has a stable policy/org/PR/participant/slot ID, participant and
season identity, PR number/link, source review/link/outcome, occurrence time,
kind, points, explanation, and `effective` status. The stable base slot survives
an edited review's change from 8 to 10 points. PP-041 can diff these desired
components against persisted components to create reversals/adjustments.

Every review also has an explained `scored`, `excluded`, or `pending` decision.
The component sum, decision point sum, and participant-total sum agree.

## Integration inputs that must not be guessed

The current canonical tables provide review outcomes, summary/inline feedback,
effectiveness, commit IDs, identities, and current PR state. They do **not** yet
provide every historical fact needed to enable automatic scoring:

| Engine input | Integration requirement |
| --- | --- |
| Review readiness and continuous-ready start | Establish the state at submission from lifecycle evidence, not today's `draft`/`ready_for_review_at` snapshot. |
| `creditBeforeReview` | Capture applicable GitHub review requirements and the pre-review credit window; a current post-approval state must not erase the approving review. |
| PR head changes | Persist/use `synchronize` or equivalent verified head-history evidence; current ingestion ignores `synchronize`. |
| Repository access intervals | Retain authorization/removal boundaries. Current `access_updated_at` is mutable and is not the original scoring start. |
| Participant `scoringFrom` | Use qualifying activity/access evidence, not row creation/processing time. Resolve out-of-order discovery before choosing the cutoff. |
| Complete review/feedback history | Load canonical formal reviews and associated inline comments, including earlier-season reviews needed for PR-lifetime caps. |
| Season definition and team entry | Supply the approved global interval and eligible-from timestamp; calendar/season persistence remains the season tickets' job. |

These are server-derived facts, **not manager settings**. Unknown author,
participant, readiness, credit, feedback, or required history produces pending
decisions. An unresolved earlier review prevents later activity from claiming
possibly occupied scoring slots. Known exclusions can still be explained.
Missing head history defers an unproven follow-through; known base components
remain explainable.

PP-041 must not treat `pending` as an authoritative zero-point recomputation
and blindly delete existing ledger entries. Resolve missing evidence and apply
explicit invalidations/reversals without inventing historical state. In
particular, the existing sandbox's merged PR is **not** evidence that its
earlier approval occurred after credit closed.

## Verification — 2026-09-27

The v1 suite covers approved score examples, strict aging boundaries, closure
and reopening, season/access boundaries, departures, deterministic ordering,
duplicate and conflicting facts, unknown evidence, and recomputed invalidations.
Abuse cases include comment spam, repeated submissions, manufactured change
requests, redundant third reviewers, repeated follow-through, SHA-only claims,
draft-time rescue farming, self/bot activity, and season-reset farming.

Run `npm test` and a focused worker TypeScript check. No database migration or
hosted deployment was needed for this isolated engine. **Live points were not
enabled by PP-040**; PP-041 now provides the worker/ledger integration described
in [reversible scoring](reversible-scoring.md), including its live-test status.

Validation passed: 40 scoring tests, 183 application tests overall, focused
TypeScript checks, production build, and lint (only existing frontend refresh
and bundle-size warnings). No frontend/demo or hosted-state changes were made.
