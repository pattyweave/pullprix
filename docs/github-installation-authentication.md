# GitHub installation authentication

PP-025 gives server-side jobs the minimum authentication machinery needed to
read data from repositories authorized for a Pull Prix installation.

## MVP flow

1. Load the active installation and its active repository IDs from the
   service-only `get_github_installation_auth_scope` database function.
2. Sign a short-lived GitHub App JWT with `GITHUB_APP_PRIVATE_KEY`.
3. Exchange that JWT for an installation access token with only
   `pull_requests: read`.
4. For a `selected` installation, request access only to the active
   `repository_ids`. For an `all` installation, let GitHub restrict the token
   to repositories authorized for that installation.
5. Keep the installation token in process memory and refresh it five minutes
   before expiration. A 401 invalidates it and retries once.
6. Return GitHub rate-limit metadata with repository-list results so a future
   backfill job can decide when to continue.

An empty `selected` scope is rejected instead of minting a token that might
accidentally have broader repository access.

## Security boundaries

- App private keys, App JWTs, and installation tokens stay on the server.
- Installation tokens are never stored in Postgres or returned to the browser.
- Tokens are treated as opaque strings; no logic depends on their prefix or
  length.
- GitHub error bodies are not included in thrown errors, reducing the chance
  that credentials or sensitive repository details reach logs.
- The database scope function is executable only by `service_role`.

## Shared modules

- `supabase/functions/_shared/github/jwt.ts` signs the App JWT.
- `supabase/functions/_shared/github/token-provider.ts` mints, restricts,
  caches, refreshes, and invalidates installation tokens.
- `supabase/functions/_shared/github/scope-repository.ts` reads the active
  installation scope.
- `supabase/functions/_shared/github/client.ts` makes authenticated GitHub API
  requests and exposes rate-limit metadata.
- `supabase/functions/_shared/github/server.ts` wires the pieces together for
  later ingestion and backfill functions.

No public Edge Function is added by this ticket. The first job that needs
GitHub API access should import `createServerGitHubApiClient`.

## Required environment

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or a compatible
  `SUPABASE_SECRET_KEYS` entry

The private key may contain real newlines or escaped `\n` sequences.

## Sandbox acceptance check

After rotating any exposed development key and updating the local environment:

1. Mint an installation token for the sandbox installation.
2. Call `GET /installation/repositories`.
3. Confirm the response contains only the repositories selected during the
   Pull Prix Dev installation.
4. Confirm no token was written to the database, browser response, or logs.

This is a read-only verification. It does not ingest pull requests or mutate
the sandbox repository.
