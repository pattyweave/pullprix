# Manager installation callback — PP-051

Status: complete. User approved the Members permission; the live owner callback
reached Pull-Prix with 1 of 1 repositories imported. Subsequent live checks passed.

## Flow and boundaries

- `/installations/callback?installation_id=...` preserves its validated destination
  through the existing GitHub sign-in flow. Only specific internal setup paths
  are accepted; arbitrary `next` URLs are rejected.
- `installation-setup` verifies the application token through a live-session RPC.
  User identity comes from `auth.identities`, never request fields or email.
- An App JWT fetches the current installation from GitHub and checks app ID,
  installation ID, account identity, and suspension. A personal installation
  requires the matching numeric GitHub owner ID. For organizations, a separate
  memory-only installation token with Members read checks active `admin`
  membership, including the returned numeric user and organization IDs.
- This first manager flow accepts organization owners. Delegated GitHub App
  managers and ordinary participants/spectators are not granted manager access;
  fuller role and repository authorization remains PP-054/063.
- The service-only commit rechecks the live session and stored active installation.
  Signed webhooks establish the installation and selected repositories. A callback
  arriving first returns a waiting state and can be retried.
- Verified memberships expire after five minutes unless rechecked. Every setup
  read and retry checks GitHub again. A failed check immediately expires the
  previous installation grant; RLS also checks lease and installation status.
  Explicit local membership removal wins over subsequent callback attempts.
  Existing manually provisioned memberships retain their previous semantics.
- Repeated normal status reads never restart imports. Only the explicit retry
  action invokes the existing idempotent backfill starter. Diagnostic error text,
  GitHub tokens, App JWTs, and credentials never appear in the browser response.
- A verified callback enters `/teams/<installationId>` immediately, with the
  current global season dates and repository import progress. Partial imports
  do not block entry. Full standings/racing UI is still PP-053/060, not claimed
  by this setup shell. Account-page team links are shown while access is valid.
  After a lease expires, reopen the team URL to revalidate access.

## Required GitHub settings

Use the **Pull Prix Dev GitHub App**, not the separate Pull Prix Sign-in OAuth App.

1. Organization settings → Developer settings → GitHub Apps → Pull Prix Dev →
   Permissions & events → Organization permissions → **Members: Read-only**.
2. Save, then approve the permission update on the existing Pull-Prix installation.
3. Set its **Setup URL** to `http://127.0.0.1:5173/installations/callback` for this
   development environment. Keep sign-in on the separate OAuth App.
4. Existing sandbox installations can use
   `http://127.0.0.1:5173/installations/callback?installation_id=164945891` directly;
   no reinstall is required.
5. Sign in as the organization owner. Verify team entry, partial/completed progress,
   and refresh without new backfill jobs. Exercise unauthorized access separately.

The initial check found Members permission absent. The user then approved it;
the live owner callback and subsequent role checks succeeded for installation
164945891. No GitHub permission was modified by Codex.

## Validation

- Application suite: 342 tests passed.
- Database suite: 570 assertions passed, including numeric account matching,
  callback idempotency, partial progress, private diagnostics, tenant isolation,
  lease expiration, suspension, local revocation and logout during verification.
- Production build and lint passed with existing warnings.
- Browser: signed-out callback shows the correct scoped sign-in/recovery link.
- Migration `20260928060000_pp051_installation_setup.sql` and `installation-setup`
  deployed to hosted project. Invalid-session hosted smoke test returned sanitized
  `401 sign_in_again`, without an access grant.

References: [GitHub setup URL security](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url),
[organization membership API](https://docs.github.com/en/rest/orgs/members).

## Access update — PP-054

Developer/spectator admission is now deployed. See [team access](team-access.md)
for the current rules; earlier owner-only descriptions above describe the initial
release. Import retries still require fresh administrator verification.
