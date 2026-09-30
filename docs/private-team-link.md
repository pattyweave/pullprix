# Private team entry link — PP-055

Status: complete; tested against the live development app.

Managers can copy `/teams/<installationId>` from the team page. It always opens
the current season for that installation; it contains no invite token, session
credential, OAuth code, query string or fragment. The link grants nothing by
itself. The same PP-054 live GitHub checks authorize each visit and map eligible
activity-derived users to participants, others to spectators.

Signed-out visitors see a GitHub sign-in link carrying only the validated internal
team destination. Existing PKCE login consumes the code and returns them to that
team. No per-person invitations or manual participant entry are needed.

Denied visitors get an account-check link and can ask an organization owner to
confirm access. Account-check mode displays the current identity without bouncing
back to the denied route; signing out and signing in again preserves the team
path. GitHub account selection remains in GitHub's own sign-in experience.

Clipboard failures reveal a selectable URL. On localhost/loopback, the panel
explicitly notes that the link works on the local computer only. A remotely
shareable URL requires running the frontend at its deployed origin with matching
Supabase redirect/CORS configuration. No production deployment or URL is invented.

## Verification — 2026-09-28

- 362 application tests passed. New tests cover secret-free URL construction,
  clipboard fallback, unauthorized recovery, spectator controls and account-check
  return preservation. Build/lint passed with existing warnings.
- Live owner dashboard: Copy team link reported success and showed the exact
  local team URL plus the localhost notice.
- Fresh isolated browser tab: no Pull Prix session, no team data shown; the team
  link led to GitHub sign-in, reused the already-authorized GitHub account, and
  returned automatically to the correct team with 3 participants and 1/1 imports.
- This is frontend-only; no database migration or Edge Function redeploy.
  PP-054's 604-assertion database suite remains the latest database verification.
