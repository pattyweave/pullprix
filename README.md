# Pull Prix

Pull Prix turns useful GitHub pull-request review work into a live seasonal
competition. The repository contains the public landing page, mock racing demo,
and the beginning of the Supabase-backed concierge MVP.

## Requirements

- Node.js 20 or newer.
- npm.
- Docker Desktop or another Docker-compatible runtime.

The Supabase CLI is pinned as a project dev dependency. Do not install a
separate global version.

## Install

```sh
npm install
```

## Frontend

```sh
npm run dev
```

Vite serves the application at `http://127.0.0.1:5173` by default. The landing
page and demo remain fully functional without Supabase running.

## Local Supabase

Start the local PostgreSQL, Auth, Realtime, Studio, and Edge Function runtime:

```sh
npm run supabase:start
```

The first start downloads the required Docker images and can take several
minutes. The CLI prints the local API URL, browser key, service-role key, and
Studio URL when startup completes.

The local stack uses shared development credentials and exposes local service
ports. Do not run it on an untrusted network or treat its keys as production
secrets.

Serve Edge Functions with live reload in a second terminal:

```sh
npm run supabase:functions
```

Invoke the public PP-010 health function:

```sh
curl http://127.0.0.1:54321/functions/v1/health
```

Rebuild the local database from committed migrations and `supabase/seed.sql`:

```sh
npm run supabase:reset
```

Run the PostgreSQL schema and tenant-isolation tests against the local stack:

```sh
npm run supabase:test-db
```

Stop the local stack when finished:

```sh
npm run supabase:stop
```

No hosted Supabase project or paid service is required for local development.

## Environment configuration

The mock landing page and demo require no environment variables. When a real
Supabase browser client is introduced, copy `.env.example` to `.env.local` and
fill in only the project URL and publishable key. Every `VITE_` variable is
public browser configuration and must never contain a secret.

Future GitHub Edge Functions use server-only configuration. For local function
development, copy `supabase/functions/.env.example` to
`supabase/functions/.env`; that destination is gitignored. Hosted values must be
set with Supabase project secrets and must never be placed in a `VITE_` variable.

Server functions should call `readServerEnvironment` before using GitHub or
administrative Supabase credentials and pass structured log context through
`redactForLog`. Configuration errors identify variable names only, never secret
values. The public health function intentionally has no secret dependency.

## Verification

```sh
npm run test
npm run lint
npm run build
npm run supabase:test-db
```

The Edge Function handler is tested through Vitest without requiring Docker.
Database reset and live function invocation require the local Supabase stack.

## Project decisions

- Product roadmap: [`roadmap.md`](roadmap.md)
- Zero-cost MVP architecture:
  [`docs/adr-001-mvp-platform.md`](docs/adr-001-mvp-platform.md)
- GitHub App implementation handoff:
  [`docs/github-app-handoff.md`](docs/github-app-handoff.md)
- Background-job operations:
  [`docs/background-jobs-runbook.md`](docs/background-jobs-runbook.md)

Build only what the active roadmap ticket requires. Paid infrastructure and
enterprise architecture are intentionally deferred until observed usage or a
customer requirement justifies them.
