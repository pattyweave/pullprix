# Connected dashboard — PP-061

Implemented 2026-09-28. `/teams/$installationId` now renders the live team dashboard;
`/installations/callback` retains setup/redirect handling. `/demo` and the landing
preview retain their existing independent mock ReplayProvider. No backend changes,
new permissions, schema migration, or production frontend deployment this ticket.

## Live data and presentation

`src/features/connected/loader.ts` loads the PP-060 season, every standings page,
review-health aggregates, and every bounded snapshot page. It checks organization,
season, contract version, pagination, unique participant IDs and consistent totals.
A read spanning a scoring/season change fails visibly and is retried on the next
refresh, rather than blending two scopes. Concurrent loads share one promise.

`useTeamData` is the per-team data provider. The route subscribes to installation
parameters and keys the provider by installation. It discards late results after
unmount and keeps private data out of global query caches and persistent storage.
No private data is reused when the user leaves/re-enters the route or switches teams.

The view includes real points, ranks/ties, unranked zero-point participants,
current-season review streaks, review-health aggregates, season/calendar/theme,
and repository setup status. Manager-only copy-link/import actions remain gated.
Loading, retry, sign-in return, account-check, unavailable installation and render
error states are present. Any failed refresh clears displayed private data.

The timeline adapter maps exact corrected-ledger samples to the display rows.
The slider selects entry/daily/current samples without interpolating points;
Back to live restores current standings. Historical health and streaks are not
invented. Names use current participant identity, with a neutral past-participant
fallback. Current health is hidden during replay. Missing metrics remain unavailable.

Points-per-circuit remains undecided: circuit artwork has no driver positions.
No progress target, lap completion, championship winner, fictional driver stats,
or mock health is inferred from actual points. Rich contribution explanations
remain PP-062; this ticket shows participant score/streak summaries.

## Refresh and access

- Poll current data every 15 seconds while visible, with no overlapping requests.
- Refresh on focus/visibility return; hide the old view while that check runs.
- Manual Refresh fetches snapshots afresh. Automatic snapshot cache lasts at most
  60 seconds and is invalidated immediately when participant IDs/points/ranks change.
- GitHub setup verification is renewed after four minutes, before the five-minute
  database lease expires. A product `access_denied` triggers exactly one additional
  setup verification and read retry. Continued denial clears data; no stale fallback.
- Signed-out sessions show a scoped sign-in link. Import retries still use the
  existing server-authorized administrator action.
- Season countdown triggers refresh at rollover. API scope checks prevent mixed
  seasons; a removed replay sample naturally returns the view to live data.

Freshness tested here is polling-to-render: a newly returned score appears on the
next visible poll, within 15 seconds plus request time. The overall roadmap target
of one minute from a GitHub action also depends on webhook/worker processing and
was not measured in this ticket; do not claim a new end-to-end latency guarantee.

## Validation and limits

415 application tests pass. Production build, lint and diff checks pass (existing
bundle-size/Fast Refresh warnings). Coverage includes pagination beyond 100 people,
expired/revoked access, session failure, team switches, scope/season mismatch,
StrictMode deduplication, cache expiry, score updates, background polling pause,
focus refresh, retry recovery, replay, spectator controls, and offline demo replay.
No database changes, so the previous 618 database assertions were not rerun.

Visual/hosted browser smoke remains unverified for this frontend change. The
browser tool rejected the localhost tab under its URL security policy. No alternate
browser or other workaround was used. PP-060's authenticated hosted API smoke
already passed in the preceding ticket; that is distinct from PP-061 visual QA.


PP-064 follow-up: see `product-states.md` for newer recovery behavior. Manual refresh
now forces setup verification as well as snapshots. Incomplete imports reverify
within one minute; access failures pause timer polling and GitHub rate limits use
a one-minute retry delay. Latest application verification: 432 tests.


## Live circuit markers (2026-09-29)

The connected dashboard now uses the same TrackMap renderer as the demo. Each
participant's real cumulative points map to distance at 90 points per lap, using
a shared helper; replay maps the selected historical points. Markers use stable
identity colors, short labels, and click selection linked to driver stats. The
circuit has an explicit responsive height. Zero points are at the start; points
above 90 continue around the circuit. Standings preserve total points/ranks and
resolve who leads when multiple laps place markers near one another.

This is the demo-compatible racing display scale requested by the user. It does
not configure the separate normalized seasonal completion/late-join target,
modify backend scores, or assign a completed-season progress policy. No backend
migration or function redeployment was needed. 446 app tests and build pass;
browser visual QA remains unverified.
