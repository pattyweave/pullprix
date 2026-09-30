# Product API — PP-060

Deployed 2026-09-28 to the existing Supabase project. The private dashboard can
now query domain data; PP-061 will render it. Public landing/demo are unchanged.

## Request contract

`GET /functions/v1/product-api?installationId=164945891&resource=season`

Send `apikey` (public browser key), `Authorization: Bearer <application JWT>`,
and the configured app Origin. The browser transport is `authClient().product`
in `src/features/auth/client.ts`; it refreshes the application session as needed.
It never places tokens in URLs. Responses use `Cache-Control: no-store` and
`contractVersion: "1"`. This release exposes the current global season only.

| Resource | Data | Pagination |
| --- | --- | --- |
| `season` (default) | Calendar, versioned theme, entry, total points, roster count | None |
| `standings` | Participant summaries, ranks/ties, breakdowns, streaks | `offset`, `limit` (default 50, max 100) |
| `snapshots` | Entry, UTC daily boundaries, current instant; points/ranks per participant | `offset`, `limit` (default/max 7 frames) |
| `review-health` | Current/baseline/recent team aggregates and aging queue counts | Fixed-size aggregates |
| `participant` | One participant's current-season profile | Requires `participantId` UUID |
| `score-history` | Effective earned components, explanation, PR link, points, policy version; newest first | Requires `participantId`; default 50, max 100 |

Paged responses contain `items`, `total`, and `nextOffset` (null at the end).
Offsets must be integers 0–20000. Unknown/duplicate parameters, malformed IDs,
and out-of-range bounds return 400. Standings ties retain the engine's stable
participant-ID order; zero points has null rank. History is ordered by occurrence
then component ID descending. PR references are product evidence links, not raw
provider payloads; no review bodies, provider identity claims, or tokens are returned.

All resources include organization/season scope, generation time, provisional
status, and unresolved PR count. Health has its own partial/complete status.
Missing baselines/timing remain null. Full health participant-share and PR-ID
arrays are intentionally omitted from this aggregate endpoint.

Snapshots use `historyBasis: current_corrected_ledger`. They reconstruct points
from today's effective ledger; reversals correct earlier samples. They do not
claim immutable snapshots, historical health, or finalized champions. Pagination
is a live view, not a frozen database cursor; reload pages when data changes or
the season rolls over. Old-season archives/finalization remain lifecycle work.

The user has not selected points per circuit. Season progress explicitly reports
`{status: "unconfigured", policy: null, team: null}`; participant/snapshot progress
is null. Do not render null as zero progress or invent targets/driver positions.

## Authorization and bounds

The function forwards the user's bearer token to `get_product_api_input`.
The SQL function checks live Auth session, active organization membership, active
installation, five-minute verification lease, and active selected-repository proof
when applicable, before invoking the existing domain loaders. The browser cannot
choose an organization independently of the installation. This read path grants
no new membership, starts no jobs, and does not change scores.

401 `sign_in_again` means the application session is missing/invalid/revoked.
403 `access_denied` means organization authorization is unavailable, including an
expired verification lease. PP-061 should reverify once with `installationSetup`
and retry only if that succeeds; do not loop or use stale cached team data after
denial. Unknown installations return the same denial. Missing participant after
team authorization returns 404 `participant_not_found`. Internal failures are
503 `product_unavailable`, without upstream details. CORS/method failures are
403 `origin_denied` / 405 `method_not_allowed`.

Pilot processing limits: 1,000 participants and 20,000 effective components in
one season. Health additionally caps all-time effective components and PRs at
20,000 each. Counts stop at limit+1; over-capacity fails explicitly rather than
publishing truncated totals. Snapshot output is at most 7 × 1,000 compact rows.
RPC input is likewise bounded and authenticated; the older underlying loaders
remain service-only. No GitHub requests occur on product reads.

## Verification

- 395 application tests; 618 database assertions; production build, lint and
  focused API type check pass (existing frontend warnings only).
- Every resource has success and missing/revoked-access contract coverage.
- Database tests exercise spectator reads, cross-tenant denial, missing teams,
  invalid season, repository removal, expired lease, revoked membership/session,
  suspended installation, oversized roster, and caller-only RPC privileges.
- Browser transport tests verify refresh, header-only tokens, bounded parameters,
  and retained session after a team denial.
- Hosted browser smoke with existing `pattyweave` session: all six resources
  succeeded for Pull-Prix, standings contained 3 people and 8 points, profile and
  one history component agreed, review health was partial, unauthorized team
  denied. Temporary smoke page removed and team dashboard restored.
- Migration `20260928090000` is deployed and recorded; Edge Function `product-api`
  is deployed. No frontend data-provider wiring or progress policy was added.
