# ADR-001: Pull Prix MVP Platform

Status: Accepted  
Roadmap ticket: `PP-006`  
Decision date: 2026-07-20

## Decision

Build the concierge MVP on the free Supabase plan and the project's existing
free Vite hosting.

Use Supabase for:

- PostgreSQL persistence.
- GitHub user authentication.
- Row-level organization authorization.
- Realtime delivery of derived season state.
- Edge Functions for GitHub webhooks and bounded processing.
- Supabase Queues for durable asynchronous work.
- Supabase Cron for queue consumption and global season transitions.
- SQL migrations managed by the Supabase CLI.
- Environment secrets required by Edge Functions.

Expected infrastructure cost for the concierge MVP:

```text
$0 per month
```

Do not add a paid application server, always-on worker, Redis instance,
separate queue vendor, paid staging environment, observability vendor, or paid
database plan until measured usage or a real pilot failure requires it.

## Governing constraint

Pull Prix is not entitled to enterprise architecture before it has proven that
teams want the product.

Every infrastructure addition must answer both questions:

1. What observed product, capacity, security, or reliability problem does this
   solve now?
2. Why can that problem not be handled safely with the existing free stack or
   a documented founder operation?

If there is no concrete answer, do not build or buy it.

This constraint does not excuse incorrect scoring, weak tenant isolation,
leaked secrets, or unverifiable webhook processing. Product correctness and
basic security are MVP requirements. Redundant infrastructure and operational
automation are not.

## Architecture

```text
Existing Vite host
  landing page, demo, private team UI
             |
             | Supabase Auth + Realtime
             v
Supabase Free project
  PostgreSQL + RLS
       |          |
    Queues       Cron
       \          /
        Edge Functions
  webhook ingestion, bounded backfills,
  scoring, snapshots, season transitions
             |
          GitHub API
```

There is no conventional backend server in the concierge MVP.

## Why Supabase

The difficult Pull Prix data is relational:

- Organizations have installations, repositories, and participants.
- Pull requests have reviews, reviewers, authors, and changing approval state.
- Contributions must be deduplicated and reversible.
- Scores must be traceable to canonical facts and policy versions.
- Seasons have time boundaries, standings, ties, and historical snapshots.

Supabase retains PostgreSQL transactions, constraints, and queries while also
providing the realtime subscriptions and serverless primitives the product
needs. It avoids choosing between a trustworthy relational ledger and a live
dashboard.

The free allowance is sufficient for the first pilots at the time of this
decision:

- 500 MB database.
- 50,000 monthly active users.
- 500,000 Edge Function invocations per month.
- 2 million Realtime messages per month.
- 200 peak Realtime connections.
- 5 GB egress.
- Two free projects.

These limits must be rechecked when implementation begins and monitored with
the provider's built-in usage screens. They are not a reason to pay in
advance.

## Frontend

Keep the current Vite application on its existing free host.

The browser uses the Supabase client for:

- GitHub sign-in.
- Authorized reads of organization season data.
- Realtime subscriptions to derived snapshots.

The browser never receives:

- The GitHub App private key.
- The webhook secret.
- Supabase service-role credentials.
- Installation access tokens.
- Raw GitHub webhook payloads.
- Data belonging to another organization.

Private team routes remain application paths:

```text
https://pullprix.com/teams/{organization-slug}
```

Knowing a URL does not grant access. PostgreSQL row-level security and
server-side authorization enforce organization membership.

## Webhook ingestion

One Supabase Edge Function exposes the GitHub webhook URL.

Its synchronous path is intentionally small:

1. Read the untouched request bytes.
2. Verify GitHub's HMAC signature against those bytes.
3. Read the event name and delivery ID.
4. Insert the verified delivery with a unique delivery-ID constraint.
5. Enqueue a versioned processing message.
6. Return success quickly.

Invalid signatures create neither a delivery nor a job. Redelivery is safe.

Raw-body verification must be covered by fixtures under `PP-021`; do not assume
that request parsing preserves the signed bytes.

## Asynchronous processing

Use Supabase Queues, which is backed by PostgreSQL's `pgmq` extension.

Queued work includes:

- Webhook normalization.
- Installation and repository reconciliation.
- Paginated GitHub backfills.
- Participant discovery.
- Scoring and reversals.
- Review-health aggregation.
- Season snapshot generation.
- Global season activation and finalization.

A Supabase Cron job invokes a queue-consumer Edge Function once per minute.
That schedule is approximately 43,800 invocations in a 30-day month, leaving
substantial room inside the free invocation allowance.

The consumer:

- Reads a small bounded batch.
- Processes each message idempotently.
- Deletes or archives successful messages.
- Leaves failed work available after its visibility timeout.
- Records a concise failure reason that the founder can inspect.

Backfills are divided into resumable repository/page jobs. No function tries to
backfill an organization in one invocation.

Do not build a generic workflow engine, dedicated worker service, or automatic
scaling system.

## Global schedules

Supabase Cron schedules the first-Monday season transition and a lightweight
periodic boundary check.

The database remains authoritative:

- Season timestamps are stored in UTC.
- Event assignment uses GitHub occurrence timestamps.
- The boundary check is idempotent.
- A late invocation repairs state without moving the boundary.

Cron timing does not determine which season earned an event.

## Realtime

Realtime subscriptions publish only derived customer-facing state such as:

- Standings.
- Participant score totals.
- Team progress.
- Review-health snapshots.
- Season lifecycle state.

Do not subscribe browsers directly to raw deliveries, canonical private facts,
job tables, secrets, or cross-organization aggregates.

Realtime improves the experience; it is not a second source of truth. A page
reload must produce the same state from PostgreSQL.

## Authentication and tenancy

Use Supabase Auth for GitHub login.

Authentication proves the GitHub identity. Pull Prix authorization then maps
that identity to organization access derived from the installed GitHub App and
stored participant/member facts.

Row-level security policies protect all browser-readable organization data.
Service-role access exists only inside trusted Edge Functions.

Minimum tenancy tests must prove:

- An authorized participant can read their organization.
- A user from another organization cannot.
- An anonymous user cannot read private team data.
- A guessed organization slug grants nothing.

Do not build enterprise roles, SAML, SCIM, custom permission editors, or an
administration hierarchy for the concierge MVP.

## Schema and migrations

Use ordinary PostgreSQL tables, constraints, indexes, and SQL migrations.

Migrations:

- Are committed to the repository under `supabase/migrations`.
- Can initialize an empty local project.
- Include row-level security policies alongside the affected tables.
- Are tested locally before remote application.
- Avoid destructive production changes unless a current feature requires them.

Do not introduce an ORM until repeated application queries demonstrate that it
reduces more work than it creates. Supabase-generated TypeScript types and
small explicit query modules are enough to begin.

## Local development

Use the Supabase CLI and Docker-backed local stack:

```text
npm run dev              Vite frontend
supabase start           local Postgres, Auth, Realtime, and Functions
supabase functions serve local Edge Functions
supabase db reset        rebuild from committed migrations and seed data
```

Use a separate private development GitHub App and an HTTPS tunnel only when
testing real webhook delivery. Fixture-driven tests should cover most webhook
work without a tunnel.

No production secret or customer data belongs in local development.

## Environments

### Local

The complete default development environment. Use local Supabase, fixtures,
and seed data for ordinary work.

### Production pilot

One free Supabase project connected to the deployed Vite application and the
private production-pilot GitHub App.

### Optional integration project

Supabase permits a second free project. Create it only when testing a remote
GitHub App flow cannot be done safely against local fixtures or the production
pilot. It is not a mandatory always-on staging environment.

Do not build full-stack preview environments. Frontend preview deployments may
continue using mock data if the existing host provides them for free.

## Secrets

Store server-only values as Supabase project secrets:

- GitHub App ID and private key.
- GitHub webhook secret.
- GitHub authentication client secret.
- Supabase service-role credentials supplied to the function environment.

Only the Supabase project URL and publishable browser key may enter the Vite
bundle. Public exposure of that key is expected; row-level security is the
authorization boundary.

Keep an example environment file with names but no real values. Log neither
secrets nor installation tokens.

## Data retention and free-tier discipline

Raw webhook bodies are temporary debugging and replay material, not permanent
product records.

For the concierge MVP:

- Retain normalized canonical facts required for scoring and explanation.
- Retain delivery IDs and processing status for deduplication and support.
- Delete old raw payload bodies after a short documented window.
- Retain compact scoring transactions and completed-season results.
- Rebuild derived snapshots when necessary.
- Reconcile recoverable GitHub facts from GitHub rather than duplicating them
  indefinitely.

The exact raw-payload window belongs to the data-retention ticket. It should be
chosen from observed debugging needs, not hypothetical compliance programs.

## Reliability appropriate to the MVP

Required now:

- Signature verification.
- Unique delivery IDs.
- Idempotent handlers.
- Reversible scoring.
- Queue retry visibility.
- Concise provider logs.
- A founder-readable failed-jobs query.
- A manual export before risky schema changes.
- The ability to rerun GitHub backfill and deterministic scoring.

Deferred until evidence requires it:

- Paid point-in-time recovery.
- Automated external backups.
- Dedicated uptime monitoring.
- Paging and on-call tooling.
- Multi-region failover.
- High availability.
- A polished operations console.
- Paid log retention.

Supabase free projects may pause after a week without activity. For an active
pilot, real product traffic should prevent that. If an inactive project pauses,
the founder restores it and runs reconciliation. Do not buy permanent compute
to solve a problem that has not occurred.

## Deployment flow

1. Run lint, type checking, unit tests, and local Supabase integration tests.
2. Apply migrations to the local reset database.
3. Deploy Edge Functions and migrations to the free project.
4. Deploy the Vite build through the existing host.
5. Exercise one signed webhook fixture and one authenticated team read.

Do not build deployment orchestration beyond repeatable documented commands
until releases become frequent enough to make the manual process painful or
unsafe.

## Upgrade triggers

Spend money or add infrastructure only after a trigger occurs:

| Observed trigger | Smallest next step |
|---|---|
| Database approaches 500 MB | Tighten retention, then upgrade storage/plan if still needed |
| Edge invocation allowance approaches limit | Reduce polling or batch more, then upgrade |
| Edge execution limits repeatedly block backfills | Add one small external worker |
| Free-project pausing disrupts an active pilot | Upgrade Supabase to Pro |
| Manual recovery proves inadequate | Add automated backups or PITR |
| Realtime connection/message limits approach quota | Reduce subscriptions, then upgrade |
| A paying customer requires an SLA or compliance control | Price the required production tier into the contract |
| Founder operations repeat across pilots | Automate that specific operation |

An upgrade trigger authorizes investigating the smallest solution. It does not
authorize an architectural rewrite.

## Alternatives

### Firebase

Firebase can also support a near-zero-cost MVP and has excellent realtime
clients and serverless functions. It was not selected because Firestore's
document model makes Pull Prix's deduplication, reversible contribution ledger,
relational eligibility rules, and aggregate recomputation more awkward.

Supabase provides realtime behavior without giving up relational constraints.

### Cloudflare free stack

Cloudflare Pages, Workers, Queues, Cron Triggers, and D1 can run this product at
zero cost. It is a credible fallback if Supabase becomes limiting. It was not
selected because it would require more custom authentication and realtime work
and would replace PostgreSQL with SQLite-backed D1.

### Render, Railway, or an always-on Node server

Deferred. These platforms become useful only if Edge Function execution limits
cause a demonstrated problem. Paying for idle web and worker processes before
the product is validated does not improve the pilot hypothesis.

### Paid Supabase

Deferred. The Pro plan removes pausing and adds capacity and backups, but those
features are not needed to run the first active pilot. Upgrade when a listed
trigger occurs.

## Sources verified for this decision

- [Supabase pricing and free allowances](https://supabase.com/pricing)
- [Supabase billing documentation](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase Queues](https://supabase.com/docs/guides/queues)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase GitHub authentication](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [Cloudflare Workers free pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## Accepted summary

```text
Infrastructure cost:
  $0 per month for the concierge MVP

Frontend:
  Existing free Vite hosting

Backend platform:
  Supabase Free

Database:
  PostgreSQL + row-level security

Realtime:
  Supabase Realtime on derived season state

Authentication:
  Supabase Auth with GitHub

Webhook runtime:
  Supabase Edge Functions

Background work:
  Supabase Queues + one-minute Supabase Cron consumer

Development:
  Supabase CLI local stack; optional second free project only when needed

Upgrade rule:
  Spend or add infrastructure only in response to an observed trigger
```
