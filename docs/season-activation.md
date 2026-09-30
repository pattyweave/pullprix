# Zero-configuration season activation — PP-053

Status: complete for the pilot entry experience; deployed and browser-verified.

The installation response now publishes the global pilot release through
`_shared/season/activation.ts`: calendar identity, definition version 1,
`racing@1.0.0`, scoring v1, championship name and last-72-hours phase.
Every team uses the same first-Monday/noon-UTC schedule. The active release
currently carries racing forward automatically; publishing different future
season content and historical archival remain lifecycle work.

The private team page loads the matching theme manifest and existing Jacarepaguá
asset, displays a ticking countdown with a local end timestamp, and refreshes at
the next season boundary. No manager launch, theme picker, target setting or
calendar configuration is offered. Unknown theme versions show a refresh state.

The expandable points guide reads point values directly from SCORING_POLICY_V1.
It explains eligibility, fallback review limits, follow-through/rescue bonuses,
dismissal credit, reversals and the difference between historical roster import
and season scoring. Existing roster and repository progress remain visible;
partial imports never gate entry into the season panel.

This circuit is the season's artwork, not a live driver-position chart. No
production normalized-progress target, team target, locked progress entry or
fabricated driver positions were introduced. A product question about 100/200
points versus deferring circuit progress was sent; no answer has arrived yet.
Record the answer before publishing a progress policy. Live standings and the
full track experience remain PP-060/061. Broader developer/spectator access still
requires PP-054; this route currently retains PP-051 owner/admin authorization.

## Verification — 2026-09-28

- 351 application tests passed. Tests cover calendar rollover, final-stage boundary,
  theme matching, rules, countdown expiry, one refresh at rollover, and entry while
  import is incomplete.
- Build and lint pass with existing warnings. No database changes for this ticket;
  prior roster/database suite remains 585 assertions passed.
- `installation-setup` redeployed to the existing Supabase project.
- Browser shows Pull Prix Championship, Jacarepaguá artwork and live countdown;
  roster remains 3 active and sandbox remains 1/1 imported.

## Access update — PP-054

Developer/spectator admission is now deployed. See [team access](team-access.md)
for the current rules; earlier owner-only descriptions above describe the initial
release. Import retries still require fresh administrator verification.
