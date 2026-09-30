# GitHub sign-in — PP-050

Status: complete; deployed and live login/reload/logout verified.
GitHub provider is enabled in hosted Supabase (checked 2026-09-28).
Real sign-in/sign-out smoke test passed as `pattyweave`.

## Implemented flow

- `/sign-in` and `/auth/callback` are new isolated routes; landing/demo routes
  and their data remain unchanged.
- The browser generates a PKCE verifier/challenge and redirects to Supabase's
  GitHub provider. Supabase owns OAuth state validation and the GitHub exchange.
- The callback removes the auth code from the URL and sends code + verifier to
  the deployed `auth-session` Edge Function. That server exchanges with Auth and
  returns only application access/refresh tokens and expiry. GitHub provider
  tokens/metadata are neither returned, logged nor persisted by Pull Prix.
- Application session tokens and the temporary verifier use per-tab sessionStorage.
  The verifier is consumed once; refresh is single-flight within the tab. Logout
  revokes the current Auth session and clears local credentials even on failure.
  Failed server revocation is reported rather than claimed as successful.
- `get_signed_in_access()` maps the Auth-owned GitHub provider identity, never
  email or mutable user metadata, to a canonical GitHub user. Repeated sign-in
  is idempotent. It attaches only existing authorized active membership rows.
  Activity-derived participants do not automatically receive authorization.
- RLS and the access RPC check a live `auth.sessions` row, so revoked tokens cannot
  read private organization data during their remaining JWT lifetime. Removed
  membership and inactive organizations fail immediately.
- No-team and revoked-session states are explicit. The team list is the verified
  authorized set; team navigation/setup comes in PP-051/060.

## Hosted/local configuration

Project: `tfniygqihihmcuitydde`.
Deployed migration: `20260928050000_pp050_github_sign_in.sql`.
Deployed Edge Function: `auth-session`, gateway JWT verification disabled because
PKCE exchange is pre-session; individual actions authenticate at Supabase Auth.
`APP_URL=http://127.0.0.1:5173` defines the exact allowed browser origin.
Local ignored `.env.local` contains only the public URL and public API key.
The local Vite server uses `http://127.0.0.1:5173/sign-in`.

## Provider configuration

Use a GitHub **OAuth App** for sign-in, separate from the existing installation
GitHub App (`pull-prix-dev`). Do not recreate the ingestion infrastructure.

- Application name: Pull Prix sign-in (development).
- Homepage: `http://127.0.0.1:5173` for this development setup.
- GitHub authorization callback:
  `https://tfniygqihihmcuitydde.supabase.co/auth/v1/callback`.
- Enter its client ID/secret directly into Supabase Authentication → Sign In /
  Providers → GitHub, and enable that provider. Do not paste secrets into chat.
- Supabase Auth URL configuration: site URL `http://127.0.0.1:5173`, allow
  `http://127.0.0.1:5173/auth/callback` as an exact redirect URL.
- Complete a real login at `/sign-in`, verify the canonical identity and no-team
  or authorized-team state, refresh the page, sign out, and confirm access fails.

The user configured the separate “Pull Prix Sign-in” OAuth App. Existing organization
access grants are not fabricated for the smoke test. Automatic installation and
role verification are the connected PP-051/054 work.

References: [Supabase GitHub sign-in](https://supabase.com/docs/guides/auth/social-login/auth-github)
and [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## Verification — 2026-09-28

313 application tests and 551 database assertions pass, plus the scoring bridge.
Production TypeScript/Vite build and lint pass with existing warnings. Tests cover
PKCE generation/one-time consumption, provider-token stripping, refresh, failed
logout cleanup, trusted identity mapping, tenant isolation, membership removal,
and immediate revoked-session RLS denial. Existing tenancy tests now include
real Auth session fixtures. Browser inspection confirms the sign-in screen renders.
Hosted invalid-code smoke test returns only `401 authentication_failed` with
no provider credentials. Live authorization navigation reached GitHub’s login page for “Pull Prix Sign-in”.
After correcting URL configuration and starting a fresh attempt, the user completed
GitHub login and the callback displayed `pattyweave` with the expected no-team state.
Browser reload preserved the signed-in identity. Sign-out completed without an
error, and a subsequent reload stayed signed out. Token refresh is covered by
automated tests; it was not forced during this live browser smoke test.
