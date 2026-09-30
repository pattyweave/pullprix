# Automatic team roster — PP-052

Status: complete, deployed and verified on the private team page.

The team page now displays the existing PP-034/035 activity-derived roster.
PR authors and formal reviewers join from the initial 60-day lookback and new
qualifying activity. No invitations, username entry or manual roster building
are required. Existing members do not disappear because of inactivity.

The PP-051 verified setup response includes organization-scoped participants,
stable IDs, display names, GitHub logins, safe avatar URLs, joined dates and active
status. The route still requires live owner/admin verification. Broader developer
and spectator access remains PP-054; roster membership never grants login access.

Excluded bots, service accounts, deleted/suspended identities and ineligible
participants are filtered with the canonical exclusion function. Operator-only
`set_github_user_exclusion` remains the correction path; see
[participant resolution](participant-resolution.md). Correction notes stay private.
Departed eligible participants remain visible as inactive; replay does not
reactivate them or erase their contribution history.

Avatars use the GitHub avatar host only and fall back to initials when missing or
broken. Empty imported rosters and imports in progress have different messages.
This screen displays roster identity, not invented positions or point totals.
Season activation and the racing presentation remain PP-053 and the team UI work.

## Verification — 2026-09-28

- 346 application tests and 585 database assertions passed. New checks cover
  roster boundaries, mid-season additions, replay, departed people, correction
  restoration, tenant isolation, operator permissions and avatar fallbacks.
- Production build and lint passed with existing warnings.
- Migration `20260928070000_pp052_automatic_roster.sql` deployed to Supabase.
  The existing Edge Function passes the new response through without redeploy.
- Live browser reload passed GitHub authorization and displayed 3 active people:
  Hollistud, pattyweave and willaimsaintweaver. GitHub avatars rendered correctly.
  The sandbox repository still showed 1 of 1 imported.

## Access update — PP-054

Developer/spectator admission is now deployed. See [team access](team-access.md)
for the current rules; earlier owner-only descriptions above describe the initial
release. Import retries still require fresh administrator verification.
