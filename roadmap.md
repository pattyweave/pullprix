# Pull Prix MVP Roadmap

This roadmap breaks the path from marketing site and interactive demo to a
private, team-deployable MVP into bounded tickets.

Detailed GitHub integration requirements live in
[`docs/github-app-handoff.md`](docs/github-app-handoff.md). That document is the
source of truth for GitHub permissions, webhook handling, normalization,
security, and the canonical contribution ledger.

## Working rules for future agents

1. Work on one `PP-xxx` ticket at a time unless the ticket explicitly requires
   a paired change.
2. Create a dedicated branch from the intended baseline before editing.
3. Do not assume the current working branch is the correct baseline.
4. Preserve the mock demo until `PP-061` explicitly integrates real data.
5. Keep GitHub payloads, scoring, generic season progress, and visual themes in
   separate layers.
6. Do not request additional GitHub permissions without updating the handoff
   and documenting the product requirement.
7. Do not invent unresolved scoring or employee-privacy policy. Tickets marked
   as product decisions must be completed first.
8. Every implementation ticket requires tests appropriate to its risk.
9. Update ticket status in this file when work begins or is completed.
10. Avoid building post-MVP capabilities while completing launch-critical work.
11. The concierge MVP must run on free infrastructure. Do not introduce paid
    services without an observed limit or customer requirement.
12. Prefer Supabase-native Auth, PostgreSQL, Realtime, Edge Functions, Queues,
    and Cron before adding another runtime or vendor.
13. Do not build a generic abstraction, administration surface, or operations
    system for a single known use case.
14. Manual founder operations are valid when they are safe, documented, and
    cheaper than automating an unproven need.
15. Security, tenant isolation, webhook integrity, and scoring correctness are
    not optional under the lean-MVP rule.

## Status and priority

- Status: `BACKLOG`, `READY`, `IN PROGRESS`, `BLOCKED`, `DONE`
- Priority: `P0` launch-critical, `P1` pilot-critical, `P2` post-pilot

## MVP launch definition

The private MVP is ready when:

- A manager can sign in, install the GitHub App, choose repositories, and reach
  the active global season in under five minutes.
- Pull Prix automatically identifies likely participants and excludes bots.
- No manager action is required to start or schedule the season.
- Developers can sign in with GitHub and reach the correct private team.
- New review activity appears within one minute.
- Every awarded point has a human-readable explanation.
- Dismissed, edited, deleted, duplicated, and self-review activity cannot create
  incorrect credit.
- The product surfaces accurate standings, review health, and a useful next PR.
- The mock demo still works without a GitHub installation.
- Installation deletion and customer-data deletion are supported.
- A full pilot season can end with a useful team recap.

---

# Concierge MVP milestone

The concierge MVP is the shortest path to learning whether Pull Prix changes
review behavior and whether teams want another season.

It is founder-supported but uses the real global season lifecycle. The founder
helps organizations install, monitors the pilot, and produces the first finale
recaps. The customer still receives a trustworthy, private, real-data product;
operational automation and polished manager tooling remain manual.

## Concierge MVP hypothesis

> If Pull Prix turns real review activity into a trusted racing season, a
> founder-assisted team will participate throughout the season, improve at
> least one review-health metric, and ask to run another themed season.

## Concierge customer experience

### Manager

1. Joins a kickoff call.
2. Installs the private GitHub App and selects repositories.
3. Returns directly to the active global season.
4. Receives a team link to share.
5. Receives founder support and a manually prepared finale recap.

### Developer

1. Opens the team link.
2. Signs in with GitHub.
3. Sees their racing identity, standings, streak, score explanations, and team
   review health.
4. Continues reviewing in GitHub without adopting a new workflow.

The manager does not receive a complete self-service administration product.
Developers do receive the authentic product loop being validated.

## What must be real

The following may not be simulated or manually fabricated:

- GitHub installation and repository authorization.
- Webhook signature verification.
- Review ingestion and deduplication.
- Pull-request and submitted-review facts.
- Participant identity and access control.
- Self-review and bot exclusions.
- Deterministic scoring.
- Score explanations.
- Standings and streaks.
- Basic review-health metrics.
- Generic season progress and racing-theme mapping.
- Private developer access.
- Data deletion after uninstall or customer request.

## What the founder may operate manually

For the first one to three design partners:

- Sending the GitHub App installation link.
- Watching installation and backfill status through logs or scripts.
- Correcting a misclassified bot or service account through an operator script.
- Explaining scoring during kickoff.
- Sharing the private team URL.
- Monitoring failed jobs and replaying them through a protected script.
- Answering support questions directly.
- Measuring baseline and finale metrics with documented database queries.
- Producing the finale recap manually from trusted product data.
- Collecting midpoint and finale feedback through interviews.

Manual operations must be documented and repeatable. They must not bypass
security, fabricate scores, or edit canonical GitHub facts.

## Concierge scoring simplification

To reduce scope while preserving trust:

- Score formal submitted reviews first.
- Support approval, changes requested, and comment-only review states.
- Exclude self-reviews, bots, drafts, and ineligible participants.
- Use a transparent base score plus only the bonuses approved in PP-001.
- Cap credit per participant per pull request.
- Support edited and dismissed reviews.
- Do not score raw diff-comment volume in the concierge MVP.
- Do not use AI review-quality analysis.
- Do not allow customer-configurable scoring.

`PP-033` may be deferred unless PP-001 decides that diff comments are required
for the core scoring philosophy.

## Concierge season simplification

- Run the same globally synchronized racing season for every organization.
- Activate seasons automatically on the first Monday at 12:00 UTC.
- Let teams installing mid-season join immediately.
- Use one scoring-policy version.
- Support active and completed states in the customer experience.
- Build the global countdown and automatic next-season boundary.
- Do not build customer-controlled scheduling or intermission configuration.
- Do not build the second theme yet.
- Produce the first finale recap manually.

The theme-independent contract remains required. The generalized theme tooling
does not.

## Concierge implementation scope

### Gate A — Decisions

Required tickets:

- PP-001 — Scoring philosophy
- PP-002 — Participant eligibility and privacy
- PP-003 — Review-health definitions
- PP-004 — Simplified season lifecycle
- PP-005 — Theme-independent contract
- PP-006 — Platform architecture

Concierge exit condition:

- No implementation agent must guess what earns points, who participates, how
  customer data is used, or how racing maps to generic progress.

### Gate B — Trustworthy GitHub facts

Required tickets:

- PP-010 — Supabase backend boundary
- PP-011 — Environment and secrets
- PP-012 — Database and tenancy
- PP-013 — Supabase Queues and scheduled processing
- PP-014 — Minimum failure visibility
- PP-020 — Private GitHub App
- PP-021 — Signature verification
- PP-022 — Delivery persistence and deduplication
- PP-023 — Installation lifecycle
- PP-024 — Repository lifecycle
- PP-025 — Installation authentication
- PP-030 — Pull-request state
- PP-031 — Submitted and edited reviews
- PP-032 — Dismissed reviews
- PP-034 — Participant resolution
- PP-035 — Initial backfill

Concierge reductions:

- `PP-014` needs inspectable Supabase logs and a repeatable failed-work query,
  not paging, a paid monitoring vendor, or an operations dashboard.
- `PP-035` may use a fixed, limited lookback appropriate to the first season.
- `PP-036` periodic reconciliation may wait until after the first internal
  season if webhook and backfill fixtures are reliable.

Concierge exit condition:

- A test organization installs successfully and produces correct, deduplicated,
  reversible review facts.

### Gate C — Authentic product loop

Required tickets:

- PP-040 — Scoring policy v1
- PP-041 — Reversible scoring
- PP-042 — Standings and streaks
- PP-043 — Basic review-health aggregation
- PP-045 — Generic season state
- PP-046 — Racing theme mapping
- PP-070 — Automatic global season transitions

Conditional tickets:

- PP-044 — Next-review recommendations

Concierge reductions:

- PP-043 initially needs active reviewers, reviewer concentration, reviews
  completed, PRs waiting over 24 hours, and baseline/season comparisons.
- PP-044 is excluded from the first concierge pilot unless recommendations are
  part of the core product hypothesis being tested.
- Awards beyond the existing racing profile may be configured manually.

Concierge exit condition:

- Real review activity produces explainable points, standings, streaks, health
  metrics, and racing progress.

### Gate D — Private team access

Required tickets:

- PP-050 — GitHub sign-in
- PP-051 — Minimal installation callback
- PP-052 — Automatic activity-derived roster
- PP-053 — Zero-configuration season activation
- PP-054 — Simplified organization authorization
- PP-055 — Private team entry link
- PP-060 — Product-domain APIs
- PP-061 — Real-data frontend provider with demo mode
- PP-064 — Critical loading and failure states

Conditional tickets:

- PP-063 — Open recommended reviews in GitHub
- PP-065 — Expanded manager review-health view

Concierge reductions:

- `PP-051` may lead to a founder-assisted setup status page rather than a
  complete manager administration product.
- `PP-052` follows the approved activity-derived roster with no ordinary
  customer configuration.
- `PP-053` routes the organization into the already-active global season; it
  does not present a launch button.
- `PP-054` needs only installer/manager and participant roles.
- `PP-062` is deferred; the existing scoring rules summary and founder-assisted
  explanations cover MVP score questions.
- `PP-064` must cover backfilling, no activity, missing permissions, suspended
  installation, and backend failure.
- `PP-065` can be replaced by the founder-provided finale report during the
  first pilot.

Concierge exit condition:

- An eligible developer can sign in, see the correct private team, understand
  their score, and watch real activity update the racing experience.

### Gate E — Safety and pilot execution

Required tickets:

- PP-080 — Privacy policy and terms
- PP-081 — Installation and customer-data deletion
- PP-085 — Founder-led pilot onboarding and support
- PP-086 — Internal end-to-end season
- PP-087 — First design-partner pilot

Concierge reductions:

- `PP-082` operations console is replaced by protected scripts and documented
  queries.
- `PP-083` automated recovery infrastructure is deferred. Before risky schema
  changes, the founder takes a manual export; canonical and derived GitHub data
  must remain replayable.
- `PP-084` automated product analytics is replaced by documented baseline,
  midpoint, and finale queries plus interviews.
- `PP-085` is a founder-run playbook rather than automated customer success.

Concierge exit condition:

- The complete install-to-deletion lifecycle works internally, then one real
  team completes a supported racing season with measured outcomes.

## Explicitly deferred from concierge MVP

- PP-033 — Diff-comment normalization, unless required by scoring philosophy
- PP-036 — Scheduled reconciliation
- PP-044 — Next-review recommendation engine
- PP-062 — Detailed participant score explanations (deferred by user after UI preview)
- PP-063 — Recommendation action
- PP-065 — Full manager health view
- PP-071 — Polished global season reveal
- PP-072 — Generalized inclusive awards system
- PP-073 — Automated finale and recap
- PP-074 — Full seasonal content-pack workflow
- PP-082 — Operations console
- PP-083 — Automated backups and tested provider restore
- PP-084 — Automated pilot analytics
- PP-100 through PP-110 — Entire post-MVP backlog

An item may move into concierge scope only when the internal season or a design
partner proves it is necessary to test the core hypothesis.

## Concierge critical path

```text
Decide the rules
PP-001..006
    ↓
Build verified GitHub ingestion
PP-010..014 + PP-020..025 + PP-030..032 + PP-034..035
    ↓
Build the authentic scoring loop
PP-040..043 + PP-045..046 + PP-070
    ↓
Connect the private team experience
PP-050..055 + PP-060..061 + PP-064
    ↓
Make it safe enough for real teams
PP-080..081 + PP-085
    ↓
Run it internally
PP-086
    ↓
Run one founder-assisted design-partner season
PP-087
```

## Concierge success criteria

The concierge MVP succeeds when:

- Installation and initial setup can be completed during one kickoff call.
- New formal review activity appears within one minute.
- Participants understand why they received their points.
- No duplicate, dismissed, bot, or self-review activity creates incorrect
  credit.
- At least half of eligible participants view the experience during the season.
- Participation does not collapse after the first week.
- At least one agreed review-health metric improves or produces a meaningful
  operational learning.
- Developers do not report that scoring encouraged shallow or harmful behavior.
- The manager says whether they would pay to run another season.
- The team expresses interest in seeing the next creative world.

## Concierge-to-self-service promotion criteria

Do not automate a manual step merely because it feels inelegant. Promote it
into the product roadmap when:

- It consumes substantial founder time across multiple pilots.
- It causes repeatable customer confusion or delay.
- It creates security or data-integrity risk when performed manually.
- Multiple customers need the same control.
- It blocks the five-minute self-service installation goal.

The first likely promotions are expected to be:

1. PP-071 — Polished global season reveal
2. PP-073 — Automated finale and recap
3. PP-082 — Operations console
4. PP-084 — Automated pilot analytics

---

# Phase 0 — Product rules and architecture

These tickets prevent implementation agents from silently making product,
privacy, or infrastructure decisions.

## PP-001 — Write the scoring philosophy

- Status: `DONE`
- Priority: `P0`
- Dependencies: none

### Outcome

Document what Pull Prix rewards, what it never rewards, and how team health
takes precedence over raw individual activity.

### Scope

- Define meaningful participation.
- Define the role of speed, consistency, coverage, and quality.
- Define anti-gaming principles.
- Define individual and team definitions of winning.
- State that standings are not intended as employee-performance rankings.

### Acceptance criteria

- A concise product document exists at
  [`docs/scoring-philosophy.md`](docs/scoring-philosophy.md).
- It answers the scoring questions assigned to PP-001 in the GitHub App
  handoff.
- It includes at least five concrete scoring examples and five non-scoring
  examples.
- Product, engineering, and marketing language can all reference the same
  principles.

## PP-002 — Define participant eligibility and privacy policy

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-001

### Outcome

Establish who appears in a season and how activity data may be used.

### Scope

- Organization members, outside collaborators, bots, contractors, and service
  accounts.
- Opt-in, opt-out, and manager override rules.
- Leave, part-time work, and role differences.
- Manager visibility and export restrictions.
- Data retention after a participant leaves.

### Acceptance criteria

- Eligibility decisions are explicit and implementation-ready in
  [`docs/participant-eligibility.md`](docs/participant-eligibility.md).
- Default behavior for every account category is documented.
- The policy states what managers should not infer from standings.
- Required participant controls are identified for the MVP.

## PP-003 — Define review-health metrics

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-001

### Outcome

Give every operational metric a precise, testable definition.

### Scope

- Review participation.
- Review load spread.
- Individual review share.
- Median time to first useful review.
- PRs waiting over 24 hours.
- Useful reviews completed and weekly trend.

### Acceptance criteria

- Every metric has a formula, time window, exclusions, and edge-case behavior
  in [`docs/review-health-metrics.md`](docs/review-health-metrics.md).
- Each definition can be implemented without reading source code.
- Recommendation and repository-coverage metrics are explicitly deferred to
  their later tickets.
- The definitions map to the current frontend or identify required UI changes.

## PP-004 — Define season lifecycle v1

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-001, PP-002

### Outcome

Specify the lifecycle of the first racing season.

### Scope

- Global first-Monday schedule.
- Scheduled, active, final-stage, finalizing, and completed states.
- Mid-season organization entry.
- Event assignment at season boundaries.
- Immediate next-season activation.
- Historical backfill cutoff.
- Co-champion tie handling.
- Versioned historical theme availability.

### Acceptance criteria

- Every lifecycle state has entry and exit conditions in
  [`docs/season-lifecycle.md`](docs/season-lifecycle.md).
- The first-Monday 12:00 UTC global schedule is defined.
- The effect of late joins, repository additions, and participant changes is
  defined.
- Finale awards and recap automation are explicitly delegated to PP-072 and
  PP-073.

## PP-005 — Define the theme-independent season contract

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-001, PP-004

### Outcome

Prevent racing concepts from becoming permanent backend domain concepts.

### Scope

- Generic participant progress.
- Standings.
- Score components.
- Team goals.
- Milestones.
- Achievements.
- Seasonal modifiers.
- Theme metadata and vocabulary mapping.

### Acceptance criteria

- A TypeScript domain proposal exists in
  [`docs/theme-independent-season-contract.md`](docs/theme-independent-season-contract.md).
- Racing track position can be derived from normalized generic progress.
- Gardening and construction examples can consume the same contract.
- The ticket does not attempt to build a general-purpose theme editor.
- Championship points, ranks, and eligibility cannot be changed by a theme.
- Theme packs may implement real versioned mechanics behind a deterministic
  interface rather than being limited to cosmetic JSON configuration.

## PP-006 — Select the MVP platform architecture

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-003, PP-005

### Outcome

Choose the smallest zero-cost platform that can run a trustworthy concierge
pilot.

### Scope

- Compatibility with the existing Vite frontend.
- Webhook raw-body verification.
- Durable background processing and retries.
- Relational persistence and migrations.
- Authentication and realtime updates.
- Local development and one free production-pilot environment.
- Explicit upgrade triggers instead of speculative infrastructure.

### Acceptance criteria

- An accepted architecture decision record exists in
  [`docs/adr-001-mvp-platform.md`](docs/adr-001-mvp-platform.md).
- Selected services support webhook ingestion and asynchronous processing.
- Local development and production deployment paths are documented.
- The decision identifies how frontend and backend are deployed.
- The concierge infrastructure baseline costs $0 per month.
- Paid hosting, always-on workers, Redis, and mandatory staging are explicitly
  deferred until an observed trigger requires them.

---

# Phase 1 — Platform foundation

## PP-010 — Scaffold the Supabase backend boundary

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-006

### Outcome

Create the minimum local Supabase and Edge Function boundary without changing
the frontend demo.

### Scope

- Supabase CLI project configuration.
- Local database and seed startup.
- One minimal Edge Function.
- Edge Function test setup.
- Local Vite-to-Supabase configuration.
- Documented local commands.

### Acceptance criteria

- The local Supabase stack starts from committed configuration.
- The test Edge Function runs locally and has an automated test.
- A fresh database can be recreated from migrations and seed data.
- The Vite demo remains functional and unchanged.

## PP-011 — Add environment validation and secret handling

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-010

### Outcome

Fail safely when required configuration is missing and keep secrets server-only.

### Scope

- GitHub App ID.
- GitHub private key.
- Webhook secret.
- Supabase project URL and browser publishable key.
- Supabase server-only service credentials.
- Public application URL.

### Acceptance criteria

- Edge Functions fail clearly when required secrets are missing.
- Example environment documentation contains no real secrets.
- Browser bundles contain only the publishable Supabase configuration.
- Logs redact secrets and tokens.

## PP-012 — Add database migrations and organization tenancy

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-006, PP-010

### Outcome

Establish durable, organization-isolated persistence.

### Scope

- Organizations.
- GitHub installations.
- Repositories.
- GitHub users.
- Participants.
- Migration tooling.
- Row-level security policies.

### Acceptance criteria

- Migrations create the initial schema from an empty database.
- Re-running migrations is safe.
- Browser-readable tables enforce an organization boundary through RLS.
- Cross-organization access tests exist.

## PP-013 — Add Supabase Queues and scheduled processing

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-006, PP-010

### Outcome

Process webhooks and backfills outside the request lifecycle using free
Supabase-native primitives.

### Scope

- Supabase Queue creation and message enqueueing.
- One-minute Cron invocation of a bounded Edge Function consumer.
- Retry policy.
- Failed-job visibility through queue/archive state and a documented query.
- Idempotency keys.
- Resumable paginated backfill jobs.

### Acceptance criteria

- A test job can be queued, processed, retried, and marked failed.
- Duplicate enqueue attempts do not duplicate side effects.
- Operators can identify and replay a failed job safely.
- No always-on worker or additional queue service is introduced.

## PP-014 — Add minimum failure visibility

- Status: `DONE`
- Priority: `P1`
- Dependencies: PP-010, PP-013

### Outcome

Make failures visible to the founder using provider logs and database state.

### Scope

- Edge Function exceptions.
- Failed webhook deliveries.
- Failed background jobs.
- Backfill failures.
- Installation and organization correlation.
- Documented founder inspection query.

### Acceptance criteria

- A forced Edge Function error is visible in Supabase logs.
- A failed job is visible through a repeatable database query.
- Logs identify a background job through processing; PP-022 must carry its
  GitHub delivery ID into that job correlation once deliveries exist.
- Private customer payloads and secrets are not exposed in monitoring.
- No paid monitoring vendor or operations dashboard is required.

---

# Phase 2 — GitHub App installation and ingestion

## PP-020 — Register the private development GitHub App

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-006, PP-011

### Outcome

Create a private GitHub App for development and test-organization installation.

### Scope

- Read-only pull-request permission.
- Required installation and review webhooks.
- Setup/callback URL.
- Webhook URL and secret.
- Private key generation and secure storage.

### Acceptance criteria

- The app installs on a test organization.
- Only documented minimum permissions are requested.
- Credentials are stored outside the repository.
- Registration settings are documented for later staging and production apps.

## PP-021 — Implement GitHub webhook signature verification

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-010, PP-011

### Outcome

Reject untrusted webhook requests before processing.

### Scope

- Raw request-body access.
- HMAC signature verification.
- GitHub event and delivery headers.
- Safe failure responses.

### Acceptance criteria

- Valid fixture signatures are accepted.
- Invalid and missing signatures are rejected.
- Parsed JSON is not trusted before raw-body verification.
- Tests cover altered payloads and malformed headers.

## PP-022 — Persist and deduplicate webhook deliveries

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-012, PP-013, PP-021

### Outcome

Guarantee that GitHub redelivery does not duplicate product effects.

### Scope

- `webhook_deliveries` persistence.
- Unique GitHub delivery ID.
- Processing status and attempts.
- Asynchronous dispatch.
- Failed-delivery replay.

### Acceptance criteria

- Replaying the same delivery processes it once.
- The webhook endpoint returns quickly after verification and persistence.
- Delivery status is inspectable.
- A failed delivery can be replayed without creating duplicates.

## PP-023 — Handle installation lifecycle events

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-012, PP-022

### Outcome

Keep Pull Prix organization access synchronized with GitHub.

### Scope

- Installation created.
- New permissions accepted.
- Suspended and unsuspended.
- Deleted.
- Account identity changes where applicable.

### Acceptance criteria

- Installation state converges after duplicate and out-of-order events.
- Suspended installations stop API work.
- Deleted installations stop ingestion and enter the deletion workflow.
- Lifecycle fixtures and tests exist.

## PP-024 — Handle repository access lifecycle

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-012, PP-022, PP-023

### Outcome

Track which repositories each installation currently authorizes.

### Scope

- Initial selected repositories.
- Repositories added.
- Repositories removed.
- All-repository installations.
- Repository rename and transfer behavior.

### Acceptance criteria

- Added repositories become eligible for backfill and ingestion.
- Removed repositories stop contributing new data.
- Historical records remain governed by documented retention rules.
- Duplicate events produce one final repository state.

## PP-025 — Implement installation-token authentication

- Status: `DONE` — recreated app credentials verified against the sandbox on 2026-09-26
- Priority: `P0`
- Dependencies: PP-011, PP-020, PP-023

### Outcome

Make authenticated GitHub API requests for each installation.

### Scope

- App JWT generation.
- Installation token creation.
- Token expiry and refresh.
- Repository and permission restriction.
- Rate-limit response handling.

### Acceptance criteria

- A test installation can list its authorized repositories.
- Tokens are never persisted unnecessarily or sent to the browser.
- Expired tokens refresh safely.
- Rate-limit metadata is available to backfill jobs.

---

# Phase 3 — Review facts and historical backfill

## PP-030 — Persist pull-request lifecycle state

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-022, PP-024

### Outcome

Maintain an accurate local representation of relevant pull requests.

### Scope

- Opened and reopened.
- Draft and ready-for-review transitions.
- Edited.
- Closed and merged.
- Requested reviewers.
- Author, repository, timestamps, title, and GitHub URL.

### Acceptance criteria

- Duplicate and out-of-order events converge on the correct PR state.
- Ready-for-review time is available for aging calculations.
- Private PR data remains organization-isolated.
- Fixtures cover draft, reopen, close, and merge transitions.

## PP-031 — Normalize submitted and edited reviews

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-002, PP-022, PP-030

### Outcome

Convert formal GitHub reviews into canonical, theme-independent contributions.

### Scope

- Approval.
- Changes requested.
- Comment-only review.
- Edited review.
- Stable GitHub source identity and version.

### Acceptance criteria

- One GitHub review produces one effective canonical contribution.
- Editing does not create duplicate credit.
- Review state and timestamp are retained.
- No points are calculated in the webhook normalizer.

## PP-032 — Normalize dismissed reviews

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-031

### Outcome

Record GitHub review validity independently of earned review-work credit.

### Scope

- Review dismissed events.
- Contribution effectiveness.
- Recalculation trigger.
- Audit history.

### Acceptance criteria

- A dismissed review becomes ineffective for GitHub approval validity. Earned
  approval points survive every dismissal (2026-09-28 clarification).
- Reprocessing the event is idempotent.
- Downstream scoring is notified without scoring inside the handler.
- Tests prove canonical validity changes without duplicating facts; scoring
  handles approval-point preservation separately.

## PP-033 — Normalize review comments

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-001, PP-022, PP-030

### Outcome

Record review comments without turning raw comment volume into automatic points.

### Scope

- Created, edited, and deleted diff comments.
- Association with PR and review when available.
- Minimal body-derived metadata.
- Stable source identity.

### Acceptance criteria

- Comment edits and deletions update one canonical record.
- Raw comment count is not treated as quality.
- The storage approach follows the approved privacy policy.
- Bot and self-authored handling is tested.

## PP-034 — Implement participant resolution and exclusions

- Status: `DONE` — deployed and verified against retained sandbox PR/review deliveries on 2026-09-26
- Priority: `P0`
- Dependencies: PP-002, PP-012, PP-031

### Outcome

Map GitHub actors to eligible Pull Prix participants.

### Scope

- GitHub user identity.
- Organization eligibility.
- Bot and service-account detection.
- Self-review exclusion.
- Internal operator corrections allowed by PP-002 (no manager roster configuration).

### Acceptance criteria

- Bots do not enter standings by default.
- Self-reviews cannot become score-eligible.
- Ineligible users' facts remain auditable without affecting competition.
- Eligibility changes do not destroy historical facts.

### Implementation and verification

- [Participant resolution](docs/participant-resolution.md) documents the worker
  integration, activity-derived roster, corrections, and future scoring gate.
- The resolver uses stored signed deliveries and canonical PR/review IDs; it
  does not call GitHub or grant authentication membership.
- Bot/service/deleted/suspended identity exclusions and self-review checks
  preserve the original contribution records. Initial backfill remains PP-035.
- Local verification: 123 application tests and 353 database assertions pass,
  including 50 participant-resolution assertions. Build, focused worker type
  checks, and lint pass (existing frontend warnings only).
- Hosted verification: both replay jobs succeeded on their first attempt;
  `pattyweave` and `Hollistud` became active, eligible participants. The merged
  PR stayed closed, its single approval stayed effective, and no authentication
  memberships were created. The approval passes the participant-only gate;
  point scoring remains PP-040.

## PP-035 — Implement initial repository backfill

- Status: `DONE` — deployed and live sandbox backfill verified on 2026-09-27
- Priority: `P0`
- Dependencies: PP-024, PP-025, PP-030, PP-031, PP-033, PP-034

### Outcome

Populate a newly installed organization with enough history to preview a season.

### Scope

- Recent open PRs.
- Relevant recently merged or closed PRs.
- Reviews.
- Review comments if included by policy.
- Per-repository cursors and progress.
- Rate limits, retries, and partial failure.

### Acceptance criteria

- Backfill is restartable and idempotent.
- A manager can see progress while backfill runs.
- One failing repository does not block the organization.
- Backfilled facts use the same normalization path as webhooks.

### Implementation notes

- Uses the existing worker/queue and a fixed 60-day lookback; no new paid service.
- Per-repo progress is tenant-readable through RLS. Its manager-facing display
  remains in PP-050/PP-051/PP-064 alongside the team UI.
- See `docs/repository-backfill.md` for automatic startup, restart behavior,
  historical-data limits, and sandbox verification.

## PP-036 — Add periodic GitHub reconciliation

- Status: `DONE` — deployed, daily schedule enabled, and live sandbox reconciliation verified on 2026-09-27
- Priority: `P1`
- Dependencies: PP-025, PP-030, PP-031, PP-035

### Outcome

Repair missed webhooks and eventual inconsistencies.

### Scope

- Scheduled recent-history reconciliation.
- Installation and repository state reconciliation.
- Review-state corrections.
- Safe re-normalization.

### Acceptance criteria

- A deliberately omitted webhook is repaired.
- Reconciliation cannot duplicate canonical contributions.
- Rate limits and per-installation failures are handled.
- Reconciliation activity is observable.

### Implementation notes

- One daily installation check through the existing queue/worker. Complete
  GitHub snapshots repair known installation state and repository access.
- Reuses PP-035 cursors for overlapping recent-history repairs; no new service
  or dashboard. Initial imports remain 60 days; repair uses 7–60 days.
- Missing-webhook recovery, review correction, idempotency, and scope-race tests
  pass. Read-only GitHub discovery was verified on the sandbox on 2026-09-27.
- Live installation refresh and repository repair completed on their first
  attempts with no duplicate PRs, reviews, or participants.
- See `docs/github-reconciliation.md` for limits, inspection, replay, and
  hosted verification results.

---

# Phase 4 — Scoring, health, and generic season state

## PP-040 — Implement versioned scoring policy v1

- Status: `DONE` — deterministic v1 engine and anti-abuse tests implemented; live ledger integration remains PP-041
- Priority: `P0`
- Dependencies: PP-001, PP-002, PP-031, PP-032, PP-033, PP-034

### Outcome

Turn canonical facts into deterministic and explainable score transactions.

### Scope

- Base contribution rules.
- Per-PR caps.
- Aging bonus approved in PP-001; coverage remains badges/statistics, not points.
- Self-review and bot exclusions.
- Policy version.
- Human-readable explanations.

### Acceptance criteria

- The same facts and policy always produce the same score.
- Every point maps to an explanation.
- Repeated low-signal activity cannot grow without limit.
- At least five gaming scenarios are covered by tests.

### Implementation notes

- `supabase/functions/_shared/scoring/v1.ts` returns stable, explainable desired
  components and per-review scored/excluded/pending decisions without I/O.
- Uses the approved 8/10/12 base values, +4 follow-through, +3 first-review
  rescue, GitHub credit windows, and two-reviewer fallback.
- Complete PR history enforces lifetime caps before season projection; unknown
  event-time evidence is pending, not invented or treated as no requirements.
- See `docs/scoring-engine.md` for deterministic semantics, tests, and the
  missing event-time inputs PP-041 must collect before enabling live points.

## PP-041 — Make scoring reversible and recomputable

- Status: `DONE` — live award, dismissal retention, and complete recomputation verified
- Priority: `P0`
- Dependencies: PP-032, PP-040

### Outcome

Correct standings when underlying GitHub facts change.

### Scope

- Score transactions or explainable components.
- Dismissed and deleted contribution handling.
- Participant eligibility changes.
- Full and incremental recomputation.
- Wire the PP-040 engine to persisted canonical facts and score components.
- Supply verified event-time readiness, pre-review credit windows, head-change
  evidence, and historical repository authorization boundaries. Current snapshots
  alone are insufficient; see `docs/scoring-engine.md`.

### Acceptance criteria

- Dismissing a previously scored approval preserves earned points, whether
  automatic or manual. Deletion and eligibility corrections still reverse credit.
- Recomputing twice produces the same result.
- Historical facts remain intact.
- Score totals cannot drift from their components.
- Missing scoring context remains explicitly pending and cannot cause a blind
  zero-point overwrite of existing valid scores.

### Implementation and verification — 2026-09-27

- Existing worker now recomputes dirty PRs and applies version-checked, reversible
  score components plus an adjustment history; no independent totals counter.
- Canonical history enrichment, retained readiness/head/access evidence, and
  pre-review GitHub gate observations feed the v1 engine. Unknown history is
  explicitly pending, not guessed from a merged PR or post-approval gate.
- 213 application tests and 477 database assertions pass. The real local
  database → engine → ledger test verifies +8, duplicate-safe replay, and -8.
- Hosted migration `20260927010000_pp041_reversible_scoring.sql` and worker
  deployed. Contents read-only permission and the corrected token scope were
  verified against GitHub on 2026-09-28. No frontend changes.
- Runbook and remaining live test: `docs/reversible-scoring.md`.
- Hosted cron processed the existing PR and preserved its canonical facts.
  Its pre-PP-041 review correctly remains `credit_unknown`, with no invented
  points. The corrected free-plan check now verifies `unconfigured` for the
  sandbox, enabling first-two-reviewer fallback for new activity.
- 2026-09-28 clarification: all approval dismissals preserve earned points.
  Canonical GitHub validity stays false; deletion and independent eligibility
  corrections still reverse points. No second base or extra fallback slot.
- Updated verification: 224 application tests, 492 database assertions, and the
  real scoring bridge pass (+8 approval, dismissal retains 8, deletion reverses 8).
- Clarified-policy migration `20260928000000_pp041_dismissed_approval_credit.sql`
  and the updated worker were deployed on 2026-09-28.
- Final live verification on 2026-09-28: sandbox PR #2 retains its dismissed
  approval and exactly 8 effective points, one component, one award adjustment,
  and no reversal. Scoring is `complete`, revision/computed revision 14.
- `20260928010000_pp041_dismissal_observation_time.sql` and worker deployed:
  dismissal timestamps use durable receipt evidence rather than unchanged PR
  `updated_at`; existing evidence repaired without changing original submission.
  225 application tests, 492 DB assertions, the SQL/engine/ledger regression
  (including legacy timestamp repair), and focused TypeScript checks pass.

## PP-042 — Implement standings and streaks

- Status: `DONE` — standings/streak calculation and server-only ledger loader verified
- Priority: `P0`
- Dependencies: PP-004, PP-040, PP-041

### Outcome

Produce season standings and consistent-participation streaks.

### Scope

- Rank.
- Ties.
- Score components.
- Current and best streak.
- Late joins.
- Season date boundaries.

### Acceptance criteria

- Results follow the approved season and scoring rules.
- Timezones and day boundaries are deterministic.
- Tie behavior is tested.
- Streaks do not reward excluded activity.

### Implementation and verification — 2026-09-28

- Pure standings computation: competition ranks, ties, co-champions after explicit
  finalization, zero-point not-started entries, component breakdowns, daily UTC
  current/best streaks, late joins, and shared global season boundaries.
- Service-role-only organization loader deployed; no cached totals or new jobs.
  Browser authorization/product endpoints remain PP-060; demo stays unchanged.
- 240 application tests, 508 DB assertions, focused TypeScript checks, and the
  SQL/engine/ledger/standings bridge pass. Lint has only existing UI warnings.
- Live sandbox standings retain exactly 8 points, rank 1, one component, and
  current/best streak 1. Known older pending history remains explicitly visible.
- Details and usage: `docs/standings-and-streaks.md`.

## PP-043 — Implement review-health aggregation

- Status: `DONE` — health aggregation and server-only loader verified; unavailable historical comparisons remain explicit
- Priority: `P0`
- Dependencies: PP-003, PP-030, PP-034

### Outcome

Compute the operational review-health metrics used by Pull Prix.

### Scope

- Review participation.
- Review load spread.
- Individual review share.
- Median time to first useful review.
- Aging review queue.
- Useful reviews completed and weekly trend.

### Acceptance criteria

- Every metric matches the PP-003 definition.
- Rolling-window behavior is tested.
- Drafts, bots, self-reviews, and ineligible participants follow policy.
- Aggregates remain organization-isolated.

### Implementation and verification — 2026-09-28

- Pure review-health aggregation and service-role-only organization loader;
  useful work comes from effective base reviews, including earned dismissed
  approvals, without counting comments or follow-through again.
- UTC baseline/recent windows, normalized weekly rates, participation, shares,
  small-team load-spread suppression, median first review and strict >24h aging.
- Missing historical eligibility or daily queue evidence returns unavailable,
  never an invented zero baseline. The current loader does not produce historical
  daily queue snapshots; this data-availability limitation is documented.
- 255 application tests, 525 DB assertions, focused TypeScript checks and the
  SQL/engine/ledger/standings/health bridge pass. Migration deployed.
- Live sandbox: 1/3 participation, one useful review, 8m 4s first-review median,
  zero aging PRs. The known older PR is pending; comparisons remain unavailable.
- Implementation details: `docs/review-health-metrics.md`.

## PP-044 — Implement next-review recommendations

- Status: `DONE` — safe candidate selection and server-only loader verified
- Priority: `P0`
- Dependencies: PP-003, PP-030, PP-034, PP-043

### Outcome

Recommend one useful PR a participant can help with next.

### Scope

- PR age.
- Repository coverage.
- Existing reviewer/author conflicts.
- Participant eligibility.
- Machine-readable recommendation reasons.
- GitHub URL.

### Acceptance criteria

- Authors are not recommended their own PR.
- Ineligible, draft, closed, and already-satisfied PRs are excluded.
- Every recommendation explains why it was selected.
- No recommendation is returned when no safe candidate exists.

### Implementation and verification — 2026-09-28

- Conservative base-review recommendations with participant/repository access,
  author/reviewer conflicts, fresh unchanged gates and lifetime fallback caps.
- Prioritize aging PRs, recent repository coverage and ready age; machine-readable
  reasons and GitHub URL, or null when no safe candidate exists.
- Server-only loader deployed. Live author receives no self-review suggestion.
  Authorized endpoints and on-demand GitHub refresh remain PP-060/063.
- Details: `docs/recommendations.md`.
- Batch validation: 289 application tests, 539 DB assertions, focused TypeScript
  checks and the extended SQL/engine integration bridge pass. Lint has only
  existing frontend refresh warnings. No landing/demo changes.

## PP-045 — Implement generic season snapshots and timeline

- Status: `DONE` — generic snapshot and corrected-history timeline calculation verified
- Priority: `P0`
- Dependencies: PP-005, PP-042, PP-043

### Outcome

Expose theme-independent participant progress over the season.

### Scope

- Generic season snapshot.
- Normalized participant progress.
- Standings.
- Health.
- Milestones.
- Timeline sampling or daily snapshots.

### Acceptance criteria

- Racing can derive track position without backend racing concepts.
- The API can represent current and historical season state.
- Gardening and construction mappings can be demonstrated in tests or fixtures.
- Snapshot generation is deterministic.

### Implementation and verification — 2026-09-28

- Generic standings/progress/milestones with explicit season definitions,
  retained prorated team-entry targets and lifecycle/finalization boundaries.
- Deterministic UTC timeline samples of the current corrected ledger; historical
  health is not fabricated. Racing, gardening and construction fixture mappings.
- Live snapshot retains eight points across 23 timeline samples; production
  theme definition/persistence and UI remain their respective tickets.
- Details: `docs/generic-season-snapshots.md`.
- Batch validation: 289 application tests, 539 DB assertions, focused TypeScript
  checks and the extended SQL/engine integration bridge pass. Lint has only
  existing frontend refresh warnings. No landing/demo changes.

## PP-046 — Define and implement racing theme pack v1

- Status: `DONE` — versioned racing theme pack and HUD adapters verified
- Priority: `P0`
- Dependencies: PP-005, PP-045

### Outcome

Map generic MVP season progress into the existing racing experience.

### Scope

- Racing vocabulary.
- Circuit progress mapping.
- Driver identities.
- Racing achievements required for the pilot.
- Theme metadata and assets.

### Acceptance criteria

- Racing-specific concepts do not leak into canonical contribution or scoring
  tables.
- Existing visual components can consume the mapping.
- A second example theme can be represented without changing the core contract.
- Only the racing theme must be production-ready for MVP.

### Implementation and verification — 2026-09-28

- `racing@1.0.0` implements the generic theme interface with racing vocabulary,
  existing Jacarepaguá geometry/SVG, stable cosmetic identities and earned-work
  badges. No scoring fields or point changes.
- Outputs typed track markers, timing rows and profile badges for reusable HUD
  components. Null ranks render an em dash; numeric demo ranks are unchanged.
- Finalized champion/co-champion badges, zero-point start-line state, inactive
  drivers and lifecycle labels are covered. Gardening compatibility fixture.
- 300 application tests pass, including actual HUD render checks; production
  TypeScript/Vite build and lint pass with existing warnings only.
- No database/deployment required. Live provider wiring remains PP-060/061;
  the public landing/demo remains unchanged. See `docs/racing-theme-pack.md`.

---

# Phase 5 — Accounts, onboarding, and launch

## PP-050 — Implement GitHub sign-in for managers and developers

- Status: `DONE` — deployed; live GitHub login, session persistence, and logout verified
- Priority: `P0`
- Dependencies: PP-006, PP-012, PP-020

### Outcome

Let people access Pull Prix using their existing GitHub identity.

### Scope

- Sign in and sign out.
- GitHub user identity mapping.
- Session handling.
- Organization access check.
- Unauthorized and revoked access.

### Acceptance criteria

- A signed-in user maps to one GitHub user record.
- Users can access only authorized organizations.
- Revoked or invalid sessions fail safely.
- Authentication tokens remain server-side where required.

### Implementation and verification — 2026-09-28

- Isolated sign-in/callback routes, PKCE, server-only GitHub token exchange,
  application session refresh/sign-out, and authorized/no-team/error states.
- Auth-owned GitHub identity mapping attaches only existing authorized membership;
  session-aware RLS rejects revoked tokens before expiry. No roster-based grants.
- Migration and `auth-session` function deployed. Invalid-code hosted check returns
  a sanitized 401. Provider enabled; navigation reaches GitHub login for Pull Prix Sign-in.
  Live callback recognized pattyweave with no unauthorized team grants; reload
  preserved identity, sign-out succeeded, and another reload remained signed out.
  Token refresh has automated coverage; not forced in the live smoke test.
- 313 application tests, 551 DB assertions, scoring bridge, production build and
  lint pass (existing warnings). Browser sign-in layout checked.
- OAuth configuration and verification details: `docs/github-sign-in.md`.

## PP-051 — Build the manager installation callback

- Status: `DONE` — live owner callback and subsequent access checks passed
- Priority: `P0`
- Dependencies: PP-023, PP-024, PP-035, PP-050

### Outcome

Return an installer from GitHub to a useful Pull Prix setup state.

### Scope

- Installation identification.
- Setup status.
- Backfill progress.
- Error and retry states.
- Redirect to the current global season as soon as the organization can be
  identified.

### Acceptance criteria

- The correct installation is associated with the signed-in manager.
- Partial backfill is communicated clearly.
- Refreshing does not restart or duplicate setup.
- Permission and installation failures provide a recovery path.

### Implementation and verification — 2026-09-28

- Authenticated callback verifies the current GitHub installation and owner/admin
  identity before granting short-lived access. Callback parameters grant nothing.
- Safe sign-in return, current-season setup entry, repository progress, explicit
  retry and permission/waiting/error states implemented. Normal reload never
  restarts backfill. Full racing/standings screens remain later tickets.
- Server/API tests and database authorization assertions pass; build/lint pass.
- User approved Members read-only; the live owner callback reached Pull-Prix
  with 1 of 1 repositories imported. Subsequent live access checks passed.
- See `docs/installation-setup.md`. PP-054 remains separate for broader roles.

## PP-052 — Build automatic roster generation

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-002, PP-034, PP-035, PP-051

### Outcome

Show a credible participant roster without manual invitations.

### Scope

- Participants derived from the approved 60-day activity lookback.
- Bot and service-account exclusions.
- Automatic mid-season participant additions.
- Display-name and avatar defaults.
- Internal operator correction for misclassified automation accounts.

### Acceptance criteria

- A newly installed team receives a populated activity-derived roster.
- Exclusions follow PP-002.
- Ordinary roster creation requires no manager action.
- Manual GitHub username entry is not required for normal setup.

### Implementation and verification — 2026-09-28

- Private team page displays the existing 60-day activity-derived roster, with
  automatic additions, canonical exclusions, avatars/fallbacks and inactive history.
- No manual roster configuration or new login grants; operator correction remains
  service-only. Tenant scope is verified before roster data is returned.
- 346 application tests, 585 DB assertions, build and lint passed (existing warnings).
- Migration deployed. Live page shows all 3 sandbox contributors with avatars.
- See `docs/automatic-roster.md`.

## PP-053 — Build zero-configuration season activation

- Status: `DONE` — pilot season entry, theme and scoring guide verified
- Priority: `P0`
- Dependencies: PP-004, PP-046, PP-052

### Outcome

Place a newly installed organization directly into the active global season
without a launch or configuration step.

### Scope

- Current global season identity and countdown.
- Installation and selected repositories.
- Automatic roster preparation.
- Scoring summary.
- Racing theme loading and activation.
- Partial-backfill state.

### Acceptance criteria

- The global season schedule follows PP-004.
- Scoring rules are understandable when the organization enters the season.
- No manager launch button or season configuration is shown.
- The organization enters the active season as soon as minimum installation
  state is available.
- Partial backfill does not block developers from seeing the live season.

### Implementation and verification — 2026-09-28

- Global activation metadata binds the calendar to racing@1.0.0/scoring v1;
  private team entry loads the circuit artwork, countdown and points guide.
- No launch/configuration controls; unfinished imports do not block season entry.
- Rollover refreshes automatically at the first Monday noon UTC boundary.
- 351 application tests, build and lint pass (existing warnings); function deployed
  and real team page verified. No database/score mutation needed.
- Circuit artwork is not a driver progress chart. Production target selection and
  live standings/track integration remain separate; see `docs/season-activation.md`.
- Developer/spectator authorization follows in PP-054.

## PP-054 — Implement organization and role authorization

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-002, PP-050, PP-051

### Outcome

Separate organization-installation access from participant and spectator
access.

### Scope

- Installation administrator.
- Participant.
- Spectator or noncoding manager.
- Server-side authorization checks.

### Acceptance criteria

- No organization role can change global season timing, theme, or scoring.
- Participants cannot modify installation or organization access.
- Managers cannot access other organizations.
- Authorization is enforced in APIs, not only hidden in the UI.
- Role changes and removed access are tested.

### Implementation and verification — 2026-09-28

- Active organization members and verified collaborators on selected repositories
  can view the team. Activity determines participant versus spectator status;
  owner/admin verification is required for installation actions.
- Server/SQL roles cannot be supplied by the browser. Demotion, lease expiration,
  local revocation, repository removal and tenant isolation are enforced/tested.
- 357 application tests, 604 DB assertions, build/lint pass. Database and function
  deployed. Live GitHub owner/member checks passed; no additional permissions.
- Removed the dashboard paragraph explaining the shared global season, as requested.
- See `docs/team-access.md` for the policy and verification limits.

## PP-055 — Generate a shareable private team entry link

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-050, PP-054

### Outcome

Let a manager share one URL with the team instead of sending individual invites.

### Scope

- Organization/season entry route.
- GitHub sign-in redirect.
- Participant mapping.
- Not-eligible and wrong-organization states.

### Acceptance criteria

- An eligible developer can open the link, sign in, and land on the team.
- The URL reveals no secret that grants access by itself.
- Ineligible users receive a clear next step.
- No manual invitation is required for eligible participants.

### Implementation and verification — 2026-09-28

- Manager Copy team link action uses the stable current-season team route without
  credentials. Signed-out visitors return through GitHub login and live access checks.
- Wrong-account recovery preserves the destination; unauthorized visitors see no
  team data. Clipboard fallback and local-development notice included.
- 362 tests, build/lint pass. Live copy and fresh-tab GitHub login return verified.
- Local preview links are not remotely reachable; deployed-origin sharing still
  requires hosting the frontend. See `docs/private-team-link.md`.

---

# Phase 6 — Real product experience

## PP-060 — Add product-domain API endpoints

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-042, PP-043, PP-045, PP-054

### Outcome

Expose season data without leaking GitHub-specific payloads to the frontend.

### Scope

- Current season.
- Timeline or snapshots.
- Standings.
- Review health.
- Participant profile and score history.

The next-review recommendation endpoint is added with PP-044 and PP-063 when
that conditional concierge capability is promoted into scope.

### Acceptance criteria

- Every endpoint enforces organization authorization.
- Responses use Pull Prix domain models.
- Pagination or bounded responses exist where required.
- API contract tests cover success and unauthorized cases.

### Verification — 2026-09-28

- Deployed `product-api` and migration `20260928090000_pp060_product_api.sql`.
- Six versioned current-season resources: season, standings, snapshots, review
  health, participant profile, and score history. See `docs/product-api.md`.
- Caller JWT plus live session/organization/installation/repository-proof checks;
  response pagination and explicit pilot input bounds; no silently partial totals.
- 395 application tests and 618 database assertions pass. Build/lint pass with
  existing warnings; focused API TypeScript check passes.
- Hosted signed-in browser smoke: three participants, eight points, all six
  resources succeeded; inaccessible installation denied. Temporary harness removed.
- Progress remains explicitly unconfigured pending a product target decision.
  PP-061 will connect these resources to the dashboard; demo remains unchanged.

## PP-061 — Add a real-data provider while preserving demo mode

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-045, PP-060

### Outcome

Let the existing frontend switch between mock demo data and connected team data.

### Scope

- Real season query.
- Timeline adapter.
- Demo provider.
- Loading and error boundary.
- Cache and refresh behavior.

### Acceptance criteria

- `/demo` remains usable without a GitHub installation.
- Connected organizations render real season data.
- Dashboard components do not understand GitHub webhook shapes.
- New activity appears within the agreed freshness target.

### Verification — 2026-09-28

- Team route now uses the scoped real-data provider, current standings/health and
  corrected daily replay adapter. Demo/landing mock providers remain independent.
- Visible-tab polling every 15 seconds, bounded snapshot cache, focus/manual
  refresh, one access recheck on denial, private-data clearing, and error recovery.
- 415 application tests, build/lint and diff checks pass. No backend deployment.
- See `docs/connected-dashboard.md`. Browser visual smoke was blocked by the
  tool's localhost URL policy; not claimed verified. GitHub-to-screen one-minute
  latency still needs end-to-end measurement; frontend polling is verified.
- Progress remains unconfigured; no invented track markers or historical health.

## PP-062 — Build participant score explanations

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: PP-040, PP-041, PP-060

### MVP scope decision

Deferred until after the MVP at the user's request following the UI preview.
Keep this ticket in the backlog; do not implement the detailed contribution list,
bonus drill-down, or excluded/reversed-activity UI as a launch prerequisite.
The preview is a proposal only. Existing point totals, scoring rules summary,
and score-history API remain available. Revisit when pilot feedback shows people
need more explanation; founder-assisted answers are sufficient for the MVP.

### Outcome

Make every participant's progress trustworthy and understandable.

### Scope

- Recent scored contributions.
- Base and bonus components.
- Excluded activity explanation where appropriate.
- Links to relevant GitHub PRs.

### Acceptance criteria

- A participant can explain their total from visible score components.
- Dismissed approvals retain earned credit and can show their GitHub dismissal
  status separately. Deleted or ineligible contributions lose score credit.
- Private repository information follows organization access rules.
- The UI avoids presenting opaque quality judgments.

## PP-063 — Connect next-review recommendations to GitHub

- Status: `BACKLOG`
- Priority: `P0`
- Dependencies: PP-044, PP-060, PP-061

### Outcome

Turn the recommendation panel into a real action.

### Scope

- Recommendation reason.
- PR title, repository, age, and URL.
- Open-in-GitHub action.
- No-recommendation state.

### Acceptance criteria

- The action opens the correct GitHub PR.
- The recommendation reason is visible.
- Stale recommendations disappear after data refresh.
- No fake or nonfunctional action is displayed.

## PP-064 — Build product loading, empty, and failure states

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-051, PP-061

### Outcome

Make the product usable before and during imperfect data conditions.

### Scope

- Installation backfilling.
- No activity yet.
- No active season.
- Missing permissions.
- Suspended installation.
- Removed repository.
- Partial data.
- Backend unavailable.

### Acceptance criteria

- Each known state has a clear explanation and next action.
- Partial data is not presented as complete data.
- Failures do not silently fall back to misleading mock data.
- Recovery paths are tested.

### Verification

- Visible import, missing-repository and incomplete-data notices with role-aware
  setup/retry actions; clear roster/zero-point and scoped no-season fallback states.
- Specific permissions, installation, GitHub and backend recovery messages;
  private data clears on failures and never falls back to mock data.
- Manual refresh rechecks setup; incomplete imports recheck within a minute;
  automatic retries pause on access failures and back off on GitHub rate limits.
- 432 application tests, build/lint and diff checks pass (existing warnings).
  No backend changes. Browser visual QA remains blocked by localhost URL policy.
- See `docs/product-states.md` for behavior and no-season/removal limitations.

## PP-065 — Build manager review-health view

- Status: `BACKLOG`
- Priority: `P1`
- Dependencies: PP-003, PP-043, PP-060, PP-061

### Outcome

Give managers useful team-health visibility without turning the product into a
surveillance dashboard.

### Scope

- Reviewer concentration.
- Active reviewers.
- Aging queue.
- Under-covered repositories.
- Trend over the season.
- Policy and interpretation guidance.

### Acceptance criteria

- Metrics match PP-003.
- The UI emphasizes team patterns rather than employee judgment.
- Managers can identify a bottleneck and the relevant next action.
- No unsupported performance score is introduced.

---

# Phase 7 — Season lifecycle and retention

## PP-070 — Implement season state transitions

- Status: `DONE`
- Priority: `P0`
- Dependencies: PP-004, PP-042, PP-045

### Outcome

Activate and finalize globally synchronized seasons at the approved monthly
boundaries.

### Scope

- First-Monday 12:00 UTC activation.
- Final-stage activation during the last 72 hours.
- Immediate next-season activation.
- Prior-season finalization in parallel.
- Event assignment using occurrence timestamps.
- Immutable completed-season policy.
- Transition jobs and recovery.

### Acceptance criteria

- Every state transition follows PP-004.
- Duplicate jobs cannot transition twice.
- All organizations observe the same active season.
- The next season starts even while the prior season is finalizing.
- Completed results remain viewable.

Implementation: `docs/season-transitions.md`. Independent calendar activation,
retryable archival worker, immutable scoped results and private season history.
Validation: 442 application tests, 638 database assertions, build/typecheck/lint.
Visual browser QA remains unverified due to the localhost tool-policy block.

## PP-071 — Build global racing season reveal

- Status: `BACKLOG`
- Priority: `P1`
- Dependencies: PP-046, PP-055, PP-070

### Outcome

Give every team a clear and memorable transition into a newly activated global
racing season.

### Scope

- Season identity.
- Participant identities.
- Rules summary.
- Global reset and countdown.
- New-season reveal state.
- Shareable team entry.

### Acceptance criteria

- Participants understand what counts and what does not.
- The experience works for existing and newly installed organizations.
- The reveal requires no manager action.
- No additional developer setup is required after sign-in.

## PP-072 — Implement team milestones and inclusive awards

- Status: `BACKLOG`
- Priority: `P1`
- Dependencies: PP-001, PP-004, PP-042

### Outcome

Make participation rewarding beyond individual first place.

### Scope

- At least one shared team goal.
- Consistency award.
- Coverage award.
- Aging-PR rescue award.
- Participation-improvement award.

### Acceptance criteria

- Award rules are deterministic and documented.
- Multiple contribution styles can be recognized.
- Awards cannot be farmed through excluded activity.
- Team goals are visible during the season.

## PP-073 — Build season finale and team recap

- Status: `BACKLOG`
- Priority: `P1`
- Dependencies: PP-003, PP-070, PP-072

### Outcome

End the season with a memorable result and measurable evidence of team impact.

### Scope

- Champion and inclusive awards.
- Participation change.
- Reviewer concentration change.
- Aging-queue change.
- Review-velocity change.
- Archived results.

### Acceptance criteria

- The recap distinguishes product facts from unsupported causal claims.
- Baseline and season windows follow PP-003.
- Completed results remain accessible.
- The recap gives a manager evidence for deciding whether to run another season.

## PP-074 — Define the seasonal content-pack workflow

- Status: `BACKLOG`
- Priority: `P1`
- Dependencies: PP-005, PP-046

### Outcome

Document how future creative worlds are designed, validated, built, and
released without changing the contribution engine.

### Scope

- Theme brief.
- Vocabulary.
- Progress mapping.
- Visual assets.
- Achievements and milestones.
- Seasonal mechanics.
- Behavioral and scoring review.
- QA and release checklist.

### Acceptance criteria

- The workflow can describe racing, gardening, and construction seasons.
- Theme work cannot silently redefine canonical GitHub facts.
- New mechanics require an incentive and anti-gaming review.
- The second theme can be planned without core ingestion changes.

---

# Phase 8 — Security, operations, and private pilot

## PP-080 — Publish privacy policy and terms

- Status: `DONE` — pilot policies linked; approved Pull Prix operator name and named founder contact path
- Priority: `P0`
- Dependencies: PP-002, PP-006

### Outcome

Explain what Pull Prix collects, why it collects it, and how customers can
control it.

### Scope

- Privacy policy.
- Terms of service.
- GitHub data categories.
- Retention.
- Deletion.
- Subprocessors.
- Contact path.

### Acceptance criteria

- Policies match actual MVP behavior.
- Installation and sign-in flows link to the policies.
- Repository and review data are described accurately.
- No compliance certification is claimed without evidence.

Pilot implementation is complete. Pre-invitation hosting disclosures and verified
domain contact aliases are tracked in `docs/pilot-onboarding.md`.

## PP-081 — Implement installation and organization data deletion

- Status: `DONE` — deletion migration and worker deployed; tenant isolation, full data cascade and delayed-event suppression verified
- Priority: `P0`
- Dependencies: PP-002, PP-023, PP-080

### Outcome

Stop processing and delete customer data according to policy.

### Scope

- GitHub App uninstall.
- Manager-requested deletion.
- Background jobs and retries.
- Retention exceptions.
- Deletion audit record without retained customer content.

### Acceptance criteria

- Uninstalled organizations stop all GitHub API work.
- Deletion removes data within the documented period.
- Jobs cannot recreate deleted organization data.
- The deletion process is tested end to end.

Implementation and support procedure: `docs/privacy-and-deletion.md`.
Verified locally with 444 application tests and 664 database assertions; no real
organization was deleted as a test.

## PP-082 — Add webhook and backfill operations console

- Status: `BACKLOG`
- Priority: `P1`
- Dependencies: PP-014, PP-022, PP-035

### Outcome

Allow the operator to support pilots without direct database manipulation.

### Scope

- Installation status.
- Backfill progress.
- Failed deliveries.
- Failed jobs.
- Safe replay.
- Reconciliation trigger.

### Acceptance criteria

- Access is restricted to authorized operators.
- Failed work can be diagnosed and replayed safely.
- No raw secrets are displayed.
- Every operator action is logged.

## PP-083 — Add backups and recovery procedure

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: PP-006, PP-012

### Outcome

Add automated recovery infrastructure after data volume, active customers, or
an observed recovery failure justifies it.

### Scope

- Database backups.
- Restore test.
- Recovery objectives appropriate to the demonstrated customer need.
- Secret and configuration recovery.

### Acceptance criteria

- Backup schedule and retention are documented.
- A restore has been tested in a non-production environment.
- Recovery steps identify responsible owner and required credentials.
- The ticket is not started merely to satisfy enterprise convention; its
  triggering incident, limit, or customer requirement is documented.

## PP-084 — Add pilot product analytics

- Status: `BACKLOG`
- Priority: `P1`
- Dependencies: PP-003, PP-051, PP-053, PP-061, PP-073

### Outcome

Measure whether teams install, participate, improve, and return.

### Scope

- Installation funnel.
- Setup completion time.
- Season launch.
- Weekly active participants.
- Recommendation usage.
- Reviewer concentration.
- PR aging.
- Season completion.
- Next-season intent.

### Acceptance criteria

- Events and metrics have documented definitions.
- Analytics exclude unnecessary private PR content.
- Pilot reports can compare baseline and season windows.
- The setup flow can measure whether the five-minute target is met.

## PP-085 — Prepare private-pilot onboarding and support

- Status: `DONE` — customer guide and founder onboarding/support playbook implemented
- Priority: `P1`
- Dependencies: PP-020, PP-053, PP-064, PP-080 (existing runbooks replace PP-082 for concierge MVP)

### Outcome

Onboard the first teams consistently and recover quickly when something fails.

### Scope

- Pilot qualification.
- Installation guide.
- Security and permissions explainer.
- Manager kickoff.
- Developer announcement template.
- Support channel.
- Incident and escalation process.
- End-of-season interview.

### Acceptance criteria

- A manager can understand requested permissions before installing.
- The team receives a concise explanation of scoring and privacy.
- Support ownership and response expectations are clear.
- Pilot feedback is collected at launch, midpoint, and finale.

Implementation: `/pilot` and `docs/pilot-onboarding.md`. Hosting/app installation
preflight remains required before outside invitations; this status does not imply
a public deployment or completed PP-086 rehearsal.

## PP-086 — Run an internal end-to-end season

- Status: `IN PROGRESS` — independent rehearsal and hosted audit passed; timed live journey pending
- Priority: `P0`
- Dependencies: PP-053, PP-061, PP-064, PP-070, PP-081 (PP-063 deferred for lean pilot)

### Outcome

Prove that the system works on real GitHub activity before involving a customer.

### Scope

- Install.
- Backfill.
- Roster.
- Launch.
- Live ingestion.
- Score correction.
- Recommendations deferred for the lean pilot.
- Season completion.
- Uninstall and deletion.

### Acceptance criteria

- The full manager path completes in under five minutes excluding GitHub's own
  approval time and asynchronous backfill.
- New review activity appears within one minute.
- Duplicate activity cannot add points; dismissed approvals keep earned credit.
- The season can complete and remain viewable.
- Uninstall stops processing and triggers the documented deletion behavior.

Evidence and exact remaining user steps: `docs/internal-season-rehearsal.md`.
Includes rollback-only scoring-to-archive-to-deletion bridge. Hosted latency
target and fresh browser/install/uninstall acceptance are not yet signed off.
September 30: fixed the new-PR fast-review gap with an explicit first-check
no-requirements fallback; deployed worker/migration and verified the rehearsal
PR now earns 10 points. Enforced/unreadable historical gates remain conservative.

## PP-087 — Run the first design-partner pilot

- Status: `BACKLOG`
- Priority: `P1`
- Dependencies: all P0 tickets, PP-014, PP-065, PP-073, PP-084, PP-085

### Outcome

Validate behavior change, trust, installation friction, and demand for another
season with a real team.

### Scope

- One qualified design partner.
- One racing season.
- Baseline measurement.
- Midpoint interview.
- Finale and impact recap.
- Renewal/next-season interview.

### Acceptance criteria

- Installation and launch friction are recorded.
- Developers can explain the scoring system.
- Reviewer participation and queue-health metrics are measured.
- Gaming, surveillance, or fairness concerns are documented.
- The team states whether it would run another season and why.

---

## PP-088 — Make pilot entry clear and verify mobile usability

- Status: `DONE`
- Priority: `P1`
- Dependencies: PP-061, PP-064, PP-085

Implemented September 30: prominent homepage/header sign-in, real pilot-guide
links instead of the placeholder waitlist, privacy/terms entry links, and copy
limited to shipped pilot capabilities. Increased dashboard touch targets and
fixed grid overflow at 320px; improved long-name wrapping and standings spacing.
Production verification covered homepage widths 320/375/768, mobile GitHub
sign-in and team selection, track/standings, driver selection, replay/back-to-live,
pilot guide and reload. All 449 existing tests passed; the final overflow fix
also passed 23 dashboard regressions and the build. Existing lint/build warnings
remain. Pilot inquiry email is intentionally not published until confirmed.
Friend access testing and season/uninstall checks remain tracked by PP-086.

---

# Post-MVP backlog

These tickets are intentionally excluded from the first private MVP unless a
pilot uncovers a blocking need.

## PP-100 — Automated billing and subscription management

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: successful design-partner pilots

## PP-101 — GitHub Marketplace publication

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: production security and repeatable onboarding

## PP-102 — Slack integration

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: validated notification use cases

## PP-103 — Microsoft Teams integration

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: validated customer demand

## PP-104 — Enterprise SSO and SCIM

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: enterprise design partner

## PP-105 — Customer-configurable scoring policies

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: stable and trusted scoring v1

## PP-106 — Theme pack v2

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: PP-074 and successful racing-season retention

### Candidate

Gardening: individual plots and a shared team garden powered by generic season
progress.

## PP-107 — Theme pack v3

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: second-theme production lessons

### Candidate

Shared pyramid construction: individual contributions build sections while team
milestones unlock larger structural stages.

## PP-108 — Customer-authored themes or theme marketplace

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: multiple internally produced themes and a stable theme contract

## PP-109 — AI-assisted review-quality signals

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: explicit privacy approval, customer demand, and trustworthy
  non-AI scoring baseline

## PP-110 — Developer cosmetics store discovery

- Status: `BACKLOG`
- Priority: `P2`
- Dependencies: successful design-partner pilots, stable scoring and season
  contracts, and evidence that persistent cosmetics improve retention

### Outcome

Validate a manager-enabled developer cosmetics store as a potential revenue and
retention product without introducing pay-to-win mechanics or changing season
standings.

### Scope

- Manager program setup and funding options.
- Spendable cosmetic credits derived from, but separate from, championship
  points.
- Optional direct developer purchases.
- Cosmetic catalog, wallet, redemption, inventory, and entitlement concepts.
- Workplace fairness, privacy, payment, tax, refund, fraud, and offboarding
  research.
- Earned-cosmetics pilot before any real-money implementation.

### Acceptance criteria

- The discovery questions and staged validation plan in
  [`docs/developer-cosmetics-store-roadmap.md`](docs/developer-cosmetics-store-roadmap.md)
  are resolved or assigned explicit owners.
- Redeeming an item cannot lower a score or alter historical standings.
- Purchases and cosmetics cannot create a competitive advantage.
- Manager-funded and developer-funded models have validated demand and credible
  unit economics before payment infrastructure is built.
- Legal, accounting, privacy, accessibility, and workplace-policy reviews are
  complete before a paid pilot.

---

# Critical path summary

The shortest responsible route to a private pilot is:

```text
PP-001..006
    ↓
PP-010..013
    ↓
PP-020..025
    ↓
PP-030..035
    ↓
PP-040..046
    ↓
PP-050..055
    ↓
PP-060..061 + PP-064
    ↓
PP-070
    ↓
PP-080..081
    ↓
PP-086
    ↓
PP-087
```

P1 tickets should be completed before or during the first design-partner pilot
when they materially improve support, measurement, or the finale. P2 tickets
must not delay the first validated season.

## PP-089 — Connected dashboard design pass 3

**Status:** DONE

- Place the selected driver panel directly below standings.
- Identify selected track drivers by full name; suppress other labels at the same lap position while preserving equal scores and marker selection.
- Improve supporting text contrast within the connected dashboard.
- Refine replay to a thin timeline with accessible keyboard and touch controls and an explicit historical timestamp.
- Distinguish pending scoring, imports, import failures, and unknown timing without promising automatic resolution.
- Rename Useful reviews to Qualifying reviews and explain the once-per-reviewer-per-PR count.
- Preserve the demo design and all scoring/access behavior.

Validation: connected dashboard and track adapter tests; production build and lint; live responsive review.

## PP-090 — Connected dashboard design pass 4

**Status:** IN PROGRESS — implementation validated; production visual review pending.

- Play/pause through recorded snapshots without interpolating scores; pause on manual scrubbing or hidden tabs, stop at the final recorded snapshot, and explicitly return to Live.
- Label the first recorded snapshot, Live endpoint, and current sample position.
- Match selected row/profile accents to stable driver colors; label unselected shared positions once as a driver count.
- Keep metrics ahead of expandable data-status explanations and move lap-distance guidance into scoring rules.
- Correct singular day labels; preserve the demo and existing scoring/access policies.

Validation: 51 connected frontend tests, production build, lint (existing warnings only).
