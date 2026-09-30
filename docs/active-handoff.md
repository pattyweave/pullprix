# Active handoff — 2026-09-30

## Latest: team picker expiry fixed

User saw only Pull-Prix despite previously visiting Piss-Boys-Studio. Hosted
audit confirmed both memberships/installations active, but Piss Boys' lease
expired September 29 while Pull-Prix had a fresh lease. Directory RPC had reused
the five-minute data-access predicate and hid the expired team.
Deployed migration 20260930010000: get_signed_in_access remembers previously
connected active team names/links independently of lease expiry. Data RLS and
GitHub revalidation on dashboard entry remain unchanged. Explicit local
revocation, inactive org/install and removed collaborator repositories still
hide entries. A remembered link is not proof of continuing access.
683 DB assertions pass including two expired teams listed while neither tenant
is readable, suspension and revocation. 17 account/dashboard loader tests pass.
User needs to refresh account screen to visually confirm both teams. No Vercel
deployment or master push required for this database-only change.

## Previous: PP-086 initial-review fallback deployed

Migration 20260930000000 and process-jobs deployed September 30. Explicit v1
initial-check policy: first observation must confirm unconfigured requirements
within five minutes of opening, matching head/review history, with opening
evidence and no intervening PR change. Keeps historical gate unknown and stores
separate initialUnconfiguredObservation/creditBasis; no backdated facts.
Enforced/unreadable gates and older historical gaps remain pending.

The rehearsal PR below now has complete scoring, revision=computed revision=9,
10 effective points (approval with feedback), computed 19:04:02.994874 UTC.
The original first observation was 18:22:03.758, PR opened 18:21:00.
449 app tests, 677 DB assertions, original and fast-review SQL/engine scoring
bridges, season archive/deletion bridge, build and lint pass (existing warnings).
User asked to refresh dashboard; visual confirmation and remaining PP-086
access/finale/uninstall checks remain open. No master push or Vercel deploy.

## Previous: PP-086 fast approval did not score

Outside installation 166282661 works; user confirmed after refresh. Test PR:
https://github.com/Piss-Boys-Studio/piss-boys-website/pull/1.
Approval by williamsaintweaver arrived and processed in 25.54 seconds, both
accounts entered the roster, but score remains pending `credit_unknown`.
Confirmed hosted observation 18:22:03.758 follows approval 18:21:34; PR-open
processing was also after approval. Revisions both 7: no stuck scoring queue.
This exposes a normal fast-review race in the historical-evidence requirement.
Do not fabricate prior observations. Full details in internal-season-rehearsal.md.
No code/scoring policy changes made for this diagnosis. Production deploys on
master push; no push performed. PP-086 remains open.

## Latest: live track markers / Vercel project

User supplied Vercel project:
https://vercel.com/patrick-weavers-projects-94a7190c/pullprix
No Vercel deployment has been performed. New test org/repo are still forthcoming.

User reported missing live driver markers compared with demo. Fixed connected
SeasonWelcome to accept the real TrackMap, mapping actual live/replay rows via
shared 90-points-per-lap demo scale. Marker clicks select stats; zero/multi-lap,
ties, colors and replay mapping tested. This display scale is distinct from the
still-unconfigured normalized season completion policy. See connected-dashboard.md.
446 app tests pass; build passes; visual QA remains unverified. Local changes
need deployment before appearing on pullprix.com.

## Previous: PP-086 independent rehearsal

Read `docs/internal-season-rehearsal.md`. PP-086 remains IN PROGRESS: independent
checks done, live timed user journey pending. New `npm run supabase:test-season`
bridges SQL/scoring/archive/authenticated history/uninstall/purge and rolls back
all data. Existing scoring bridge, 444 app tests, 664 DB assertions, build/lint pass.
Hosted queue: 43 succeeded, no failures/pending jobs, completed reconciliation,
active schedules and 8 effective points. PR #1 remains `credit_unknown` (known
historical evidence gap), not an ingestion failure. Latest submitted review took
10.13s to process; full dashboard latency unproven. Historical aggregate p95 is
about 21 minutes, not a passed one-minute SLA.

User confirmed Vercel and pullprix.com. SPA config and Vercel privacy disclosure
are prepared; no local project link/CLI was available and no deployment or origin
cutover occurred. Need the existing Vercel project link/access, GitHub installation visibility check,
and a disposable install + second human review + browser checks + uninstall.
No real installation deleted, no GitHub messages/reviews posted, no hosted data
rewritten, no browser block workaround. Policies retain founder contact until
aliases are active. Correct guide URL: http://127.0.0.1:5173/pilot.

## Previous: PP-080 / PP-081

PP-081 migration 20260929010000 and worker hook are deployed. Last-installation
uninstall triggers an atomic team purge on worker maintenance; service-only
verified requests share that path. Suppression records prevent stale events from
recreating erased data; genuine later installations start fresh. Read
`docs/privacy-and-deletion.md` before operating deletion. No actual sandbox or
customer org was erased. Hosted preflight had zero deleted organizations.

PP-080 pilot implementation is complete using the user-approved Pull Prix
operator display name and Patrick's private onboarding contact path. No legal
entity suffix or working email alias is invented. Optional support/privacy
aliases can be added after the user verifies them.

PP-085 is implemented: `/pilot` customer guide, sign-in/dashboard help links,
and `docs/pilot-onboarding.md` founder playbook. Outside invitations still require
HTTPS frontend hosting, confirmed provider disclosures, callback/origin setup,
and GitHub App installation eligibility for the partner org. The current Dev app
is documented private to its owning organization. No hosting provider chosen,
DNS changed, email sent or invitation dispatched during this ticket.

Next is PP-086 internal end-to-end rehearsal. PP-071 remains deferred polish.
Do not equate current unit/DB coverage with a completed hosted customer rehearsal.
Visual browser QA remains unverified; preserve the prior browser-tool restriction.

## Previous: PP-070

PP-070 implements independent next-season activation and retryable immutable
season results. See `docs/season-transitions.md`. New frontend route:
`/teams/:installationId/history`; empty until the first season ends. Migration
20260929000000, process-jobs and product-api are deployed to the linked development project.
442 application tests and 638 DB assertions pass; build, backend typecheck and
lint pass with existing warnings. Browser visual QA remains unverified; do not
retry or route around the prior localhost browser tool-policy block.

PP-062 stays deferred. Circuit progress remains unconfigured pending the user's
points-per-circuit decision. Next roadmap candidate is PP-071; do not add badges,
recaps or participant score explanations as part of this ticket.

## Start here

PP-050 is complete. The separate “Pull Prix Sign-in” OAuth App is configured;
real GitHub login returned to Pull Prix as `pattyweave` with the expected no-team
state. Browser reload preserved identity; sign-out completed without an error,
and another reload remained signed out. Automatic token refresh has automated
coverage; it was not forced in this live browser smoke test.

Implemented/deployed: `/sign-in`, `/auth/callback`, PKCE, server exchange stripping
provider tokens, per-tab application sessions, refresh/logout, trusted GitHub
identity mapping, existing-membership attachment and session-aware RLS. Migration
`20260928050000_pp050_github_sign_in.sql` and `auth-session` deployed. APP_URL is
`http://127.0.0.1:5173`; ignored `.env.local` contains public browser settings.
Read `docs/github-sign-in.md`. Preserve the existing ingestion GitHub App.

Validation: 313 application tests, 551 DB assertions, scoring bridge, production
build and lint previously passed (existing warnings). Live login/reload/logout
smoke test now passed. The browser was left signed out after that test; subsequent setup/roster work below
uses the user’s new signed-in session.

PP-051 and PP-052 are complete. User approved Members read-only for Pull Prix Dev;
the real owner callback reached Pull-Prix with the sandbox repository fully imported.
Read `docs/installation-setup.md` and `docs/automatic-roster.md`.

PP-052 migration 20260928070000 is deployed. The private team page shows the
activity-derived roster with canonical exclusions, GitHub avatars/initial fallbacks,
and inactive departed contributors. No new activity-to-authorization grant.
Operator correction remains service-only. The same verified setup RPC now returns
roster; no Edge Function redeploy was needed.

Live reload at /teams/164945891 passed fresh authorization and displayed three
active contributors: Hollistud, pattyweave, willaimsaintweaver. All avatars rendered;
repository still 1/1 imported. Browser remains on this signed-in team page.
Validation: 346 application tests, 585 DB assertions, build/lint passed (existing
warnings). No commits or GitHub permission mutations by Codex.

PP-053 is now complete for pilot season entry. `installation-setup` redeployed with
`_shared/season/activation.ts` global racing@1.0.0/scoring-v1 metadata. UI shows
circuit artwork, ticking countdown, rollover refresh, canonical points guide and
existing roster/import status. Live browser verified. 351 app tests, build/lint
pass; no DB change this ticket. See `docs/season-activation.md`.

An optional async question is outstanding: choose 200 or 100 points per circuit,
or defer visual progress. No answer yet. Do not infer one. Current circuit is
artwork only; no normalized-progress target, driver positions or team target was
published. Record user answer for PP-060/061 and preserve scores independently.

PP-054 is implemented/deployed. Read `docs/team-access.md`. Active org members and
verified selected-repository collaborators can view the team; activity-derived
roster determines participant/spectator, admin check protects import retries.
New migration 20260928080000 adds role/proof and complete_team_access RPC. Old
complete_installation_setup is an internal helper (service HTTP execute revoked).
357 application tests/604 DB assertions pass; build/lint pass existing warnings.
Read-only GitHub checks verified pattyweave admin and Hollistud ordinary member.
User requested removal of shared-global-season explanatory paragraph; removed.
PP-055 is complete. Manager Copy team link action and wrong-account recovery added.
Read `docs/private-team-link.md`. 362 tests/build/lint pass. Live copy worked, and a
fresh sessionless browser tab went through real GitHub login and returned directly
to the correct team. Local links explicitly warn they only work on this computer;
no production hosting has been introduced. No backend change this ticket.
PP-060 is complete and deployed. Read `docs/product-api.md`. New `product-api`
Edge Function, authenticated `get_product_api_input` SQL boundary, six bounded
current-season resources, and browser session transport (`authClient().product`).
Migration 20260928090000 is recorded/applied hosted. 395 application tests and 618
DB assertions pass; build/lint pass existing warnings. Hosted browser smoke used
the existing session: all six resources succeeded (3 participants, 8 points),
inaccessible installation denied. Temporary test harness removed; team page restored.
Local migration history predates some already-installed functions: migration up
encountered existing PP-042, so only PP-060 was applied directly via local psql.
Do not blindly replay prior migrations or reset the user's database.
PP-061 is implemented. `/teams/$installationId` now renders `connected/TeamDashboard`
with `useTeamData` / `createTeamLoader`: 15-second visible polling, focus/manual
refresh, per-mount private cache, all API pages, one GitHub recheck on access denial,
strict scope checks, real standings/health and discrete corrected-ledger replay.
Demo and landing remain on the independent mock ReplayProvider. No backend change
or production frontend deployment. 415 app tests/build/lint pass existing warnings.
Read `docs/connected-dashboard.md`. Browser visual verification was blocked by the
browser tool URL security policy on the localhost tab; no workaround attempted.
Do not claim PP-061 hosted visual QA or end-to-end GitHub-to-screen latency passed.
PP-062 was previewed only and is now deferred to the post-MVP P2 backlog at the
user's explicit request: detailed score explanations feel overbuilt for MVP.
Do not implement its contribution/exclusion/reversal UI as the next task. Existing
scores, rules summary and API remain; use founder-assisted explanations initially.
PP-064 is implemented; see `docs/product-states.md`. Visible import/empty/partial
states, role-aware recovery, explicit permissions/suspension/backend errors,
manual setup recheck, one-minute incomplete-import refresh, access-failure polling
pause, GitHub-rate-limit backoff and 20-second browser transport timeouts added.
432 app tests/build/lint pass with existing warnings. No backend change or frontend
hosting deployment. Visual browser QA remains unverified due to the URL-policy block.
No-season behavior handles an explicit authorized null response; global calendar
still always provides a season. Removed repository notices compare setup results
within a visit; fresh empty selection uses neutral copy.
PP-062 remains deferred P2. PP-063 recommendations and PP-065 expanded health view
remain conditional/deferred; don't promote them automatically. Consult the required
MVP season lifecycle/safety gates for the next ticket. Frontend freshness is verified at
15 seconds after API data changes; total ingestion latency remains to measure.
The progress-target question remains unanswered: API progress is null/unconfigured,
not zero. No dummy driver positions. Current-season snapshots are corrected-ledger
samples, not immutable historical captures; health is current-only.
Global release currently uses racing across calendar months; future theme publishing
and historical archives remain lifecycle work. Preserve landing/demo and dirty tree.

PP-046 and earlier tickets remain complete. Preserve dirty work and landing/demo.
User authorizes small connected batches and wants pragmatic free-tier MVP progress.

The remaining sections retain the original debugging/setup context for reference;
the bug and pending status described below are historical, now resolved.

## Working style and scope

- Free-tier, lean MVP. Build what is needed now; no enterprise architecture,
  additional failure pipelines, dashboards, or paid infrastructure.
- Make scoped fixes directly, run relevant tests, and report results. Ask only
  for material product decisions or genuinely new authority, not routine steps.
- Preserve basic auth, tenant isolation, and correct scores without expanding
  this into a speculative hardening project.
- The user does not want more landing-page/demo changes. Those earlier changes
  were deliberately isolated. Backend work can remain on the main line.
- Current branch is `master`. There is substantial uncommitted PP-034 through
  PP-041 work. It is intentional; do not reset, clean, or indiscriminately commit
  it. Inspect the working tree and change only what this fix requires.
- No need to recreate GitHub/Supabase setup, rotate secrets, or repeat onboarding.

## Product decisions to preserve

Pull Prix makes PR reviewing fun, spreads review participation, and reduces slow
reviews. Global creative seasons are a core differentiator: racing now, other
themes later. Teams do not configure/start seasons. Seasons run first Monday
12:00 UTC to the following first Monday 12:00 UTC; mid-season installs join now.
Roster is activity-derived; zero-point racing participants are “On the Start
Line.” Ties can be Co-Champions. No streak point multipliers or PR-size scoring.

Most recent explicit decision: **every dismissal preserves earned approval
points**, including manual maintainer dismissals. GitHub approval validity may
be false while work credit remains. Deletion and independent eligibility
corrections still apply. Dismissal must not create an extra base award or free a
fallback slot. See scoring-philosophy.md and scoring-engine.md for full rules.

## Historical live test and resolved bug

Sandbox PR: https://github.com/Pull-Prix/pull-prix-sandbox/pull/2

- PR UUID: `59c5e7ac-7911-4eea-8d72-e8c2647e0760`; still open.
- Opened `2026-09-28T18:57:55Z`.
- Pre-review gate: `unconfigured`, observed `18:58:02.619Z`, latest review null.
- Head: `c4cd703744291378f8b6fa6b8c4c113def785bf3`.
- Approval: `2026-09-28T19:05:59Z`, GitHub review `5343385337`.
- Review UUID: `8333e2b5-1e86-48e3-bfa7-9082836d77a3`.
- Reviewer Hollistud, GitHub user `46799244`; author pattyweave `16235589`.
- Participant UUID: `302201bb-0d9c-4197-83e7-10fb8f58b41d`.
- Approval correctly earned 8 points, one effective approval component, one
  adjustment. Before dismissal, scoring was complete at revision 7.
- User manually dismissed it. Latest read: original review_state approved,
  effective=false, dismissal metadata present, no deletion metadata. Points
  still 8, exactly one adjustment, no reversal/duplicate. This part works.
- BUT scoring is now pending (`credit_unknown`), revision=computed_revision=11.

Confirmed cause: `private.capture_scoring_event` uses the PR snapshot's
`updated_at` for dismissal events. This payload timestamp was unchanged from
the approval, so the recorded dismissal occurred_at is **19:05:59Z**, identical
to the original approval. The historical gate loader treats that dismissal as
an intervening event before/at the approval and invalidates the valid earlier
gate. `normalizeReviewDismissal` also uses pull_request.updated_at for its
dismissed_at; inspect that related path while fixing the timestamp semantics.

Relevant code:

- `supabase/migrations/20260927010000_pp041_reversible_scoring.sql`:
  `private.capture_scoring_event` (~106), historical gate join (~283).
- `supabase/functions/process-jobs/github-review.ts`: dismissal normalization.
- `supabase/migrations/20260928000000_pp041_dismissed_approval_credit.sql`:
  scoring-only approvalDismissed flag and wrappers around loader/enrichment.

Pick the smallest correct fix using actual available event/receipt evidence;
do not invent a GitHub dismissal timestamp. Preserve the distinction between a
review's original submission and its later dismissal. Add a focused regression
for unchanged PR.updated_at. Both migrations above are already deployed: use a
new migration for SQL changes, including a scoped repair of existing evidence
and recomputation if needed. Do not merely force the pending status to complete.

Acceptance: current sandbox review remains dismissed in canonical data, scoring
is complete, exactly 8 effective points and one award adjustment remain after
recomputation. Document live proof and mark PP-041 complete only after verifying.

## Implementation and verification already done

- PP-040 pure engine: `_shared/scoring/v1.ts`.
- PP-041 integration: `process-jobs/scoring.ts`, existing once-per-minute worker
  and queue; no new service. Stable score components plus change records.
- Earned approval retention is implemented in engine, SQL, and worker. An
  explicit `approvalDismissed` flag permits scoring known original approvals;
  do not globally treat all ineffective reviews as valid.
- GitHub token provider now requests pull_requests:read and contents:read.
  User approved the installation permission change. Contents used only for
  branch metadata, not repository code reads.
- GitHub Free/private rulesets return a specific unavailable-feature 403;
  client handles only that message after checking classic protection. Generic
  permission failures still do not imply unconfigured review requirements.
- Last full verification: 224 application tests, 492 DB assertions (16 files),
  focused TypeScript check passed, lint only pre-existing frontend warnings.
- `npm run supabase:test-scoring` exercises actual SQL -> TS engine -> SQL:
  +8 approval, idempotent replay, dismissal keeps8, deletion reverses8. Fixture
  rolls back. It did not cover this live webhook timestamp behavior yet.
- Local Docker/Supabase were started and healthy; check if still running.
- No frontend code changes in this phase.

Commands: inspect package.json; `npm run supabase:test-db` and
`npm run supabase:test-scoring`. Local Supabase CLI is
`./node_modules/.bin/supabase` (2.109.1). TS6 focused checks require
`--ignoreConfig` when passing files directly.

## Hosted setup and safe access

- Repo root: `/Users/patrickweaver/Workspace/pullprix`.
- Supabase project: `tfniygqihihmcuitydde` (already linked/logged in).
- API: `https://tfniygqihihmcuitydde.supabase.co`.
- App ID: `4369060`, slug `pull-prix-dev`.
- Installation GitHub ID: `164945891`.
- Installation UUID: `e90a9109-7fbc-4a4d-8d22-d48295edbdb5`.
- Organization UUID: `8babfb9a-1d7c-4f06-a71f-142e545d8b9b`.
- Repository GitHub ID: `1309233419`.
- Repository UUID: `8d4f72c3-7526-422c-a915-5c572486faa6`.
- Credentials are already configured in `supabase/functions/.env` and deployed.
  Never print their contents; parse in memory when necessary.

Read-only hosted SQL works:
`./node_modules/.bin/supabase db query --linked "<SQL>"`.
Network/Docker operations may require sandbox escalation. Avoid the previously
hanging db-push dry run. Previous migrations were applied atomically through
the authenticated management query endpoint together with their corresponding
`supabase_migrations.schema_migrations` record (version/name/statements). Check
existing migration state before applying anything; never double-apply.

Worker deployment:
`./node_modules/.bin/supabase functions deploy process-jobs --project-ref tfniygqihihmcuitydde --use-api`.
The existing minute schedule can process the repair; no need to create new cron.
If manually invoking process-jobs, it accepts the named default `sb_secret_`
key via `apikey` header, not the legacy service_role JWT (which returned401).
Retrieve project API keys into memory via CLI only, never show them in output.

Old sandbox PR #1 (`d3ff31de-90c9-4108-9285-bf0698d9bf05`) intentionally stays
pending: it predates historical pre-review gate evidence. Do not retro-award it
using current branch rules. Only PR #2 is the live completion check.

## References and next ticket

Read the PP-041 and PP-042 sections of roadmap.md, docs/reversible-scoring.md,
and the focused files above; no need to reread the entire project history.
PP-042 covers private standings/ranks/ties/co-champions, component breakdowns,
streak stats, and season/late-join behavior. Finish PP-041 and report before
automatically expanding into the next ticket.
