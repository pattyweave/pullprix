# PP-070 season transitions and saved results

The shared occurrence-time calendar activates each season on the first Monday
at 12:00 UTC and enters the final stage 72 hours before its end. New activity
belongs to the new season immediately, independently of archival work.

The existing minute worker prepares missing ended-season rows, requests any
needed post-boundary repository reconciliation, and finalizes at most two ready
results per tick. Duplicate preparation and commits are safe. A revision digest
is rechecked before committing so stale computed results retry.

The pilot uses the full 24-hour late-event grace window. At that point a team
must have completed post-boundary repository imports, no unsettled ingestion or
repair jobs, and no unresolved scoring relevant to the old season. New-season-only
pending scoring does not block old results. Unresolved work can exceed the
24-hour target; we retain the truthful `finalizing` state rather than publish
incomplete results. This never delays the new season.

Completed results save the original pilot definition (racing@1.0.0, scoring v1),
standings, points, ranks, shared champions, and streaks. Zero-point participants
remain unranked. Health and circuit progress remain null: no historical health is
invented and no points-per-circuit target has been approved. Ordinary later
GitHub corrections can update the canonical ledger but cannot change an archive.

`/teams/:installationId/history` lists completed/finalizing seasons and reads
saved results. Product API resources `seasons` and `archive` forward the user's
JWT to `get_season_history`. Live sessions, fresh team-access leases, repository
proof, active installations and tenant boundaries apply on every read. There is
no public archive or client-authorized finalization endpoint. Current-season
replay retains its existing corrected-ledger semantics.

## Operations

- Inspect `season_results` for old `finalizing` rows. Check repository backfill
  status/completion times, unsettled background jobs, and relevant pending PR
  scoring before retrying existing reconciliation/scoring tools.
- Worker failures log `season_finalization_failed`; the next minute retries.
  Unsupported definitions and capacity limits (1,000 participants or 20,000
  effective components) require operator investigation; never truncate results.
- Missed worker ticks recover ended seasons from the organization's installation
  date. This pilot supports the one fixed definition; introducing future versions
  requires a versioned season-definition source before activation.
- Support corrections are deliberately not a routine API. Obtain a reviewed,
  season/organization-specific correction with evidence, save the original
  snapshot and reason in the support record, and apply a narrowly scoped audited
  database migration. The completed-result trigger must be explicitly handled
  in that maintenance transaction and restored before commit. Never globally
  unlock results or replay normal GitHub events to rewrite published standings.
- Organization deletion may remove archived data through the existing privacy
  cascade. Read-only sporting results do not override deletion requirements.

Validation: 442 application tests, 638 database assertions, production build,
focused backend typecheck, lint (existing warnings only). Browser visual QA remains
unverified because the browser tool blocked localhost access in this session.

Deployment: migration `20260929000000` and `product-api` / `process-jobs` are
deployed to the linked Pull Prix development project.
