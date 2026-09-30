# Standings and streaks — PP-042

`supabase/functions/_shared/standings/v1.ts` derives a season snapshot from the
existing effective score ledger. It never awards points, modifies the ledger,
or adds a background job. `calculateStandings(input, asOf, finalized=false)` is
pure and deterministic. Scoring and standings share the first-Monday-at-noon UTC
calendar in `_shared/scoring/season.ts`.

The server-only RPC `get_organization_standings_input(organization_id, season_id)`
loads one organization's roster, effective components, entry time, and pending
work count. Only `service_role` can execute it. A later product endpoint must
verify organization membership before using it; the function itself is not a
browser API. Product endpoints and real-data UI remain PP-060/061. The demo and
landing page are unchanged.

## Standings rules

- Sum effective components; preserve their source links, explanations and kind
  breakdowns. Reversed components never enter the input.
- Exact ties share competition ranks (`1, 1, 3`). Participant ID stabilizes display
  order inside ties without changing rank.
- Eligible zero-point participants have `not_started` status and no rank. The
  racing presentation can label this “On the Start Line.”
- Eligible departed participants retain earned points. Ineligible participants
  are omitted. Repository removal does not erase the retained ledger.
- Half-open season boundaries, organization entry, and the as-of cutoff prevent
  pre-entry, wrong-season, and future awards from appearing. Existing scoring
  remains responsible for repository access and per-activity eligibility.
- Snapshots remain provisional until the season lifecycle explicitly supplies
  finalization. Tied positive-point leaders become co-champions only then; an
  empty season has no champion. Pending work blocks final standings.
- The pending count conservatively includes unresolved work across the
  organization, including older PRs. Season finalization is a later ticket.

## Display-only streak default

Daily UTC streaks are the MVP default. Each UTC calendar day with an effective
base or follow-through component counts once; a rescue bonus cannot add a day.
Multiple reviews or components on the same day do not extend the streak.
Weekends follow the same calendar rule. No points, multiplier, or penalty is
attached to a streak.

Current streak is the consecutive run ending today or yesterday. After a whole
missed UTC day it becomes zero. Best streak is the longest run in the season.
Both reset at the season boundary, including the partial opening UTC day. For
historical seasons, current streak is measured at the closing day, so it does
not decay as the present date advances. Dismissed earned approvals keep their
streak contribution; reversals/deletions remove the affected earned activity.

## Verification — 2026-09-28

- 240 application tests, 508 database assertions, focused TypeScript checks,
  and the SQL → scoring engine → ledger → standings bridge pass.
- Tests cover competition ties, co-champions, zero-point entries, UTC offsets,
  missed days, duplicate activity, season resets, late joins, departures,
  excluded participants, reversals, organization isolation, and server-only access.
- Migration `20260928020000_pp042_standings_input.sql` deployed to the existing
  sandbox project. The worker was redeployed with the shared calendar extraction.
- Live September standings: participant `302201bb-0d9c-4197-83e7-10fb8f58b41d`
  has rank 1, exactly 8 points, one component, current/best streak 1. Two other
  eligible participants have zero points and no rank.
- The loader reports one pending older PR (the known pre-gate-evidence PR #1);
  it does not conceal that history or fabricate a final season. PR #2's earned
  eight-point ledger is unchanged.
