# Generic season snapshots and timeline — PP-045

`supabase/functions/_shared/season/snapshot.ts` composes PP-042 standings and
optional PP-043 health into a deterministic generic snapshot. It uses the approved
contract: season definition/version, theme reference, organization entry, lifecycle,
participants, standings, score explanations, normalized progress and milestones.

The season author supplies a versioned progress policy; there are no customer
settings. Individual normalized progress is capped at one, while points and ranks
continue increasing. `createSeasonEntry` computes the starting roster and prorated
team target using the authored late-join floor. The lifecycle owner must retain
that returned entry and reuse it, so later roster additions do not move the target.
An empty starting roster has no team target. This calculator does not persist or
activate seasons; those responsibilities remain with the lifecycle tickets.

`createSeasonSnapshot` accepts an explicit time. It derives scheduled, active,
final-stage (last 72 hours), and finalizing states from the global calendar.
Completed state and champion/co-champion achievements require explicit
finalization and no pending scoring work. Generic participant/team milestones
follow normalized thresholds. Additional season-authored achievements belong to
the theme/lifecycle work.

`sampleSeasonTimeline` returns entry-time, UTC daily, and final-cursor samples.
These reconstruct progress from the **current corrected ledger**, not the exact
information known to the service at each past moment. Reversals therefore correct
the replay. They are not immutable audit snapshots. Historical health is never
fabricated: a health attachment must match organization, season and timestamp;
timeline samples carry no health unless separately supplied through snapshot
creation. Current eligibility corrections remain authoritative.

The snapshot uses generic normalized progress and contains no backend racing
positions. Fixtures demonstrate identical progress as track position, plant
growth and construction completion. The 200-point target used in tests/live
validation is only a fixture, not a published production season definition.
PP-046 owns the production racing theme pack; PP-060/061 own endpoints and UI.

Validation on 2026-09-28: 289 application tests, 539 database assertions, focused
TypeScript checks and the SQL/scoring/ledger/standings/health/snapshot bridge pass.
Live sandbox snapshot retained exactly eight points (0.04 with the fixture target)
and generated 23 timeline samples. One older unresolved PR remains explicitly
pending. Landing page and demo are untouched. No new database or worker needed
for this pure module.
