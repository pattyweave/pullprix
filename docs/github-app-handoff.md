# Pull Prix GitHub App — Implementation Handoff

## Start here

Use this document as the source of truth for a separate implementation task.
Do not begin by wiring GitHub payloads directly into the existing dashboard.
The durable product is a theme-independent contribution and scoring engine;
racing, gardening, pyramid construction, and future seasonal worlds are
presentation layers over that engine.

The stable boundary between that engine and seasonal game code is defined in
[`docs/theme-independent-season-contract.md`](theme-independent-season-contract.md).

The accepted zero-cost concierge platform and its build-only-when-needed
constraints are defined in
[`docs/adr-001-mvp-platform.md`](adr-001-mvp-platform.md). Do not substitute a
paid always-on server or worker without one of that ADR's observed upgrade
triggers.

Suggested opening prompt for the implementation task:

> Implement the Pull Prix GitHub App integration described in
> `docs/github-app-handoff.md`. Begin with Phase 1 only. Preserve the existing
> frontend and mock demo, use minimum GitHub permissions, and keep raw GitHub
> ingestion separate from scoring and seasonal presentation. Before editing,
> inspect the current branch and create a dedicated GitHub integration branch
> from the intended baseline.

## Product objective

Pull Prix should turn real GitHub review activity into trustworthy,
theme-independent season progress.

The integration must support four product outcomes:

1. Recognize meaningful review contribution.
2. Show whether review participation is spreading across the team.
3. Surface aging or under-covered pull requests.
4. Provide stable progress data that any seasonal theme can render.

The GitHub App is not responsible for visual themes, achievements, or UI
animation. It supplies verified facts and derived product data.

The approved participant and standings policy is documented in
[`docs/participant-eligibility.md`](participant-eligibility.md).

The approved review-health definitions are documented in
[`docs/review-health-metrics.md`](review-health-metrics.md).

The approved global lifecycle is documented in
[`docs/season-lifecycle.md`](season-lifecycle.md).

## Current frontend seam

The existing replay system already consumes a `SeasonTimeline`:

- `src/features/replay/types.ts` defines `SeasonTimeline` and `DaySnapshot`.
- `src/features/replay/ReplayProvider.tsx` currently calls
  `generateTimeline(35)`.
- `src/features/replay/generateTimeline.ts` is the mock data source.
- Everything downstream consumes snapshots rather than raw events.

The eventual frontend migration should replace the mock timeline factory with a
timeline query or adapter. Do not make dashboard components understand GitHub
webhook shapes.

Target dependency flow:

```text
GitHub webhooks / backfill
        ↓
Canonical contribution ledger
        ↓
Scoring + review-health policies
        ↓
Theme-independent season state
        ↓
SeasonTimeline API adapter
        ↓
Racing / gardening / construction UI
```

## Recommended MVP boundary

Build an organization-installed GitHub App that is read-only at first.

The MVP should:

- Receive installation and repository-access changes.
- Receive pull-request and review activity.
- Verify, deduplicate, normalize, and persist webhook events.
- Backfill enough recent history to start a season.
- Resolve GitHub users into Pull Prix participants.
- Produce standings and review-health data through an API.
- Link users to recommended pull requests in GitHub.
- Recompute safely when an event is edited, dismissed, or redelivered.

The MVP should not:

- Comment on pull requests.
- Assign reviewers.
- Merge or modify pull requests.
- Read repository contents.
- Require individual GitHub OAuth authorization unless a later product flow
  genuinely needs to act as a user.
- Treat standings as employee-performance evaluation.
- Finalize scoring rules inside webhook handlers.

## GitHub App registration

The completed development registration and reproducible settings are recorded
in [`github-app-registration.md`](github-app-registration.md).

Start private and install it only on a test organization.

### Initial repository permissions

- Pull requests: **Read-only**
- Metadata: implicit GitHub App access

### Optional organization permission

- Members: **Read-only**, only if organization membership or team membership is
  required to determine eligible participants.

Do not request Contents access for the review-activity MVP. Add write
permissions only when a specific, approved product capability requires them.

### Initial webhook subscriptions

- `installation`
- `installation_repositories`
- `pull_request`
- `pull_request_review`
- `pull_request_review_comment`

Consider `issue_comment` later only if general pull-request conversation should
count. GitHub models those comments separately from reviews and diff comments,
so they must not be silently treated as equivalent.

Useful actions include:

- Installation: created, deleted, suspended, unsuspended, new permissions
- Installation repositories: added, removed
- Pull request: opened, reopened, ready for review, converted to draft, closed,
  edited, assigned, unassigned, review requested, review request removed
- Pull request review: submitted, edited, dismissed
- Review comment: created, edited, deleted

Confirm the exact supported action set against GitHub's current webhook
documentation during implementation.

## Authentication model

Use three distinct concepts:

1. **App authentication**
   - App ID and private key create a short-lived JWT.
   - Used to request installation access tokens.

2. **Installation authentication**
   - Installation ID comes from webhook payloads or stored installation data.
   - Short-lived installation tokens perform organization/repository backfills.
   - Limit tokens to the required repositories and permissions when possible.

3. **User authorization**
   - Not required for the ingestion MVP.
   - Add only if Pull Prix later needs user-specific GitHub access or actions
     attributable to an individual.

Never expose the private key, webhook secret, installation tokens, or user
tokens to the browser.

## Webhook ingestion contract

The public webhook endpoint should do as little synchronous work as possible:

1. Read the raw request bytes.
2. Verify the GitHub HMAC signature using the webhook secret.
3. Read `X-GitHub-Event` and `X-GitHub-Delivery`.
4. Reject invalid signatures.
5. Deduplicate by delivery ID.
6. Persist or enqueue the verified delivery.
7. Return a success response quickly.
8. Normalize and process asynchronously.

Requirements:

- Delivery processing must be idempotent.
- Redelivery must not award points twice.
- Out-of-order deliveries must not corrupt current state.
- Deleted, edited, or dismissed activity must be reversible.
- One failing delivery must not block unrelated installations.
- Logs must include delivery ID and installation ID without logging secrets.
- Raw payload retention should be time-limited and justified.
- Provide a safe replay mechanism for failed deliveries.

## Canonical data model

Names are illustrative; adapt them to the selected database.

### `github_installations`

- `id`
- `github_installation_id` — unique
- `account_id`
- `account_login`
- `account_type`
- `status` — active, suspended, deleted
- `installed_at`
- `suspended_at`
- `created_at`
- `updated_at`

### `github_repositories`

- `id`
- `installation_id`
- `github_repository_id` — unique
- `owner`
- `name`
- `full_name`
- `private`
- `active`
- `created_at`
- `updated_at`

### `github_users`

- `id`
- `github_user_id` — unique
- `login`
- `avatar_url`
- `account_type`
- `created_at`
- `updated_at`

### `participants`

- `id`
- `organization_id`
- `github_user_id`
- `display_name`
- `eligible`
- `joined_at`
- `left_at`

Keep participant eligibility explicit. Bots, suspended accounts, and service
accounts should not automatically enter standings. Outside collaborators follow
the approved activity-derived eligibility policy.

For the concierge MVP, apply the activity-derived roster rules in
`docs/participant-eligibility.md`: human PR authors and formal reviewers from
the selected repositories during the 60-day roster lookback. Outside
collaborators are not excluded merely because of employment classification;
eligible human activity governs participation.

### `pull_requests`

- `id`
- `github_pull_request_id` — unique
- `repository_id`
- `number`
- `author_github_user_id`
- `title`
- `html_url`
- `state`
- `draft`
- `opened_at`
- `ready_for_review_at`
- `closed_at`
- `merged_at`
- `first_review_at`
- `last_activity_at`
- `updated_at`

### `review_contributions`

This is the canonical, theme-independent ledger.

- `id`
- `source_type` — review, review_comment, thread_resolution, future source
- `source_github_id`
- `source_version`
- `installation_id`
- `repository_id`
- `pull_request_id`
- `actor_github_user_id`
- `action`
- `review_state` — approved, changes_requested, commented, dismissed, etc.
- `body_present`
- `occurred_at`
- `effective`
- `superseded_at`
- `metadata_json`
- `created_at`
- `updated_at`

Use a stable source identity so edits and dismissals update or invalidate an
existing contribution rather than creating duplicate credit.

### `webhook_deliveries`

- `delivery_id` — unique
- `event_name`
- `action`
- `installation_id`
- `signature_valid`
- `status` — received, processing, processed, failed, ignored
- `attempt_count`
- `last_error`
- `received_at`
- `processed_at`

### `seasons`

- `id`
- `theme_id`
- `theme_version`
- `name`
- `starts_at`
- `final_stage_starts_at`
- `ends_at`
- `scoring_policy_version`
- `status` — scheduled, active, final_stage, finalizing, completed

Seasons are global Pull Prix content releases. They are not owned or scheduled
by an organization.

### `organization_season_entries`

- `organization_id`
- `season_id`
- `eligible_from`
- `installation_id`
- `joined_at`
- `created_at`

`eligible_from` is the earliest timestamp at which the organization may earn
points in that global season. For a mid-season installation, it is the
repository-access timestamp rather than the global season start.

### `season_scores`

- `organization_id`
- `season_id`
- `participant_id`
- `points`
- `rank`
- `review_count`
- `approval_count`
- `feedback_review_count`
- `changes_requested_count`
- `follow_through_bonus_points`
- `aging_rescue_bonus_points`
- `updated_at`

Store explainable components rather than only a total score.

## Normalization rules

Raw GitHub events should normalize into facts before scoring.

Examples:

- A submitted approval becomes one effective review contribution.
- Editing the body updates the existing contribution version.
- Dismissing a review makes the associated contribution ineffective.
- A diff comment is associated with its review when GitHub provides that
  relationship.
- Multiple webhook deliveries describing the same GitHub object do not create
  multiple contributions.
- Bot-authored events are retained for audit if needed but excluded from
  participant scoring by default.
- Reviews on draft pull requests are either excluded or explicitly governed by
  scoring policy.
- Self-reviews never earn competitive credit.

Do not derive points during normalization.

## Scoring boundary

Scoring must be versioned, deterministic, explainable, and reversible.

The approved concierge-MVP scoring policy is documented in
[`docs/scoring-philosophy.md`](scoring-philosophy.md). Implementations must
follow that policy rather than inferring point values from the current mock
data.

Input:

- Canonical contributions
- Participant eligibility
- Pull-request state and age
- Repository coverage
- Season dates
- A versioned scoring policy

Output:

- Point transactions or score components
- Standings
- Streak state
- Achievement candidates
- Review-health aggregates

Recommended principle:

```text
facts are permanent
scoring policies are versioned
themes interpret progress
```

A season may change its visual mechanics without rewriting GitHub history.
Conversely, scoring experiments should not require webhook reingestion.

### Guardrails to encode early

- Cap repeated low-signal activity on the same pull request.
- Never reward self-review.
- Avoid making raw comment count a quality proxy.
- Prevent approvals after trivial or automated changes from dominating.
- Allow dismissed or deleted work to remove credit.
- Make difficult or under-covered work eligible for bonuses without forcing a
  specific implementation immediately.
- Keep team goals available alongside individual standings.
- Preserve an explanation for every awarded point.

## Review-health derivation

The metric source of truth is `docs/review-health-metrics.md`. Implement those
definitions rather than creating new rolling windows or customer-configurable
thresholds.

The approved concierge metrics are:

- Review participation.
- Review load spread.
- Individual review share.
- Median time to first useful review.
- Aging review queue using a fixed 24-hour threshold.
- Useful reviews completed and normalized weekly trend.

The current demo may contain additional placeholder health or recommendation
fields. Those are not automatically required for the concierge MVP.
Under-covered repository logic and next-review recommendation ranking belong to
their later roadmap tickets.

## Backfill strategy

Webhooks only describe activity after installation, so the app needs an initial
backfill.

MVP backfill:

1. Store the installation and selected repositories.
2. Fetch recent open pull requests.
3. Fetch reviews and relevant review comments for those PRs.
4. Optionally fetch recently closed or merged PRs within the first season's
   lookback window.
5. Normalize through the same code path used for webhooks.
6. Record a per-repository backfill cursor and completion status.

The backfill must be restartable and idempotent. Respect installation rate
limits and do not block the installation-complete user experience while the
entire history loads.

## API boundary for the frontend

Prefer product-domain endpoints over GitHub-shaped endpoints.

Illustrative contract:

```text
GET /api/seasons/current
GET /api/seasons/:seasonId/timeline
GET /api/seasons/:seasonId/standings
GET /api/review-health
GET /api/recommendations/next-review
GET /api/participants/:participantId/profile
```

The timeline response should adapt cleanly to the existing `SeasonTimeline`
shape, but track position must eventually become generic season progress rather
than a permanent domain concept.

Suggested future-neutral model:

```ts
interface ParticipantProgress {
  participantId: string
  points: number
  normalizedProgress: number
  rank: number
}

interface SeasonSnapshot {
  day: number
  standings: Standing[]
  progress: ParticipantProgress[]
  health: ReviewHealth
}
```

The racing theme can map `normalizedProgress` onto a circuit. A garden theme can
map it to plant growth. A construction theme can map it to contributed blocks.

## Suggested service boundaries

Do not add all of this to the Vite browser application.

Suggested logical modules:

```text
server/
  github/
    app-auth
    installation-auth
    signature-verification
    webhook-router
    webhook-normalizers
    backfill
    github-client
  contributions/
    repository
    eligibility
    normalization
  scoring/
    policies
    transactions
    standings
    streaks
  seasons/
    service
    timeline-builder
    theme-contract
  review-health/
    metrics
    recommendations
  api/
    routes
```

These are conceptual boundaries, not required directories or deployable
services. The accepted Supabase architecture may implement several boundaries
inside one Edge Function or SQL migration until a real maintenance problem
justifies splitting them.

## Delivery phases

### Phase 1 — App skeleton and verified ingestion

- Use the accepted Supabase Free runtime, database, Auth, Realtime, Queue, and
  Cron boundary.
- Add environment validation.
- Add the webhook endpoint.
- Verify signatures against raw request bytes.
- Persist and deduplicate deliveries.
- Handle installation and repository-access lifecycle events.
- Add local webhook fixtures and tests.
- Register a private development GitHub App.

Acceptance criteria:

- Invalid signatures are rejected.
- A redelivered webhook is processed once.
- Installation and repository records converge correctly.
- No GitHub secrets reach client code or logs.

### Phase 2 — Review normalization

- Handle pull-request lifecycle events.
- Handle submitted, edited, and dismissed reviews.
- Handle created, edited, and deleted review comments.
- Normalize events into the canonical ledger.
- Exclude bots and self-reviews from eligibility.
- Add replay and out-of-order event tests.

Acceptance criteria:

- One GitHub review maps to one effective canonical contribution.
- Edits do not duplicate credit.
- Dismissals remove effectiveness.
- Processing order does not change the final state.

### Phase 3 — Backfill and organization setup

- Fetch selected repositories and recent review history.
- Resolve participant eligibility.
- Track backfill progress and failures.
- Provide an installation/setup status API.

Acceptance criteria:

- A newly installed organization receives usable recent data.
- Restarting backfill does not duplicate contributions.
- Removed repositories stop contributing new data.

### Phase 4 — Scoring and review health

- Implement scoring policy v1 as a pure, deterministic module.
- Persist explainable score components or transactions.
- Derive standings, streaks, participation, queue health, and recommendations.
- Add scoring fixtures covering gaming and fairness edge cases.

Acceptance criteria:

- Every score is explainable from canonical facts and a policy version.
- Re-running scoring produces the same result.
- Invalidated contributions remove their prior effect.
- Health metrics match documented definitions.

### Phase 5 — Frontend integration

- Add product-domain API queries.
- Adapt API season state to the replay provider.
- Preserve a demo/mock mode.
- Add loading, empty, partial-backfill, disconnected, and permission-error
  states.
- Make recommended PR links open the correct GitHub URL.

Acceptance criteria:

- The existing demo still works without GitHub.
- A connected organization renders real season data.
- Theme components never receive raw GitHub payloads.

## Testing strategy

Minimum automated coverage:

- Signature verification with valid and invalid fixtures.
- Delivery deduplication.
- Installation suspend, unsuspend, delete, and repository removal.
- Review submitted, edited, and dismissed.
- Review comment created, edited, and deleted.
- Bot, self-review, and ineligible-user handling.
- Webhooks arriving before related backfill objects.
- Redelivery and out-of-order processing.
- Scoring determinism and reversibility.
- Recommendation conflict rules.
- Timeline adapter compatibility with the frontend.

Keep sanitized webhook fixtures in the repository. Never commit production
payloads containing private organization data.

## Security and privacy requirements

- Use minimum GitHub permissions.
- Verify every webhook signature before parsing it as trusted input.
- Encrypt secrets and tokens at rest using the hosting platform's secret store.
- Rotate webhook secrets and private keys through a documented procedure.
- Do not persist source code or request Contents permission for the MVP.
- Minimize stored comment bodies; prefer derived metadata unless text is
  required for an approved quality feature.
- Support installation deletion and organization-data deletion.
- Define retention for raw webhook payloads and audit logs.
- Isolate every query and background job by organization/installation.
- Treat repository names, PR titles, identities, and activity as private
  customer data.

## Product decisions required before Phase 4

These should not be guessed by the implementation task:

1. Who is eligible to compete?
2. Do general PR comments count, or only formal reviews and diff comments?
3. How is a substantive/helpful review defined without inspecting source code?
4. What actions can earn points more than once on one PR?
5. How are leave, part-time schedules, and different job roles handled?
6. Are standings individual, team-based, opt-in, or configurable?
7. What data can managers export or use in performance processes?
8. How long is a season and what happens between seasons?
9. Does historical activity count when an app is first installed?
10. What is the first team-wide win condition beyond individual rank?

## Definition of done for the GitHub integration

The integration is ready for a private customer pilot when:

- A GitHub organization can install the app with documented minimum
  permissions.
- Installation and repository lifecycle changes are handled.
- Review activity is ingested idempotently and can be backfilled.
- Canonical contributions remain independent from scoring and themes.
- Scoring is explainable, versioned, deterministic, and reversible.
- Review-health metrics have precise documented definitions.
- The existing frontend can consume real season state without understanding
  GitHub payloads.
- The mock demo remains available.
- Data deletion, secret handling, and failure recovery are documented.
- Pilot metrics can measure reviewer concentration, active reviewers,
  time-to-first-review, and aging PRs.

## Official references

- [Registering a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app)
- [Choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [Building a GitHub App that responds to webhook events](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-github-app-that-responds-to-webhook-events)
- [Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- [Generating an installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [Best practices for creating a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app)
