# PP-085 — Founder-led pilot onboarding and support

Owner: Patrick. Customer guide: `/pilot`. Policies: `/privacy` and `/terms`.
This ticket prepares a supported pilot, not an automated administration product.
Support and onboarding: support@pullprix.com. Privacy and deletion requests:
privacy@pullprix.com. Patrick confirmed inbound delivery and replies work for
both addresses on October 6, 2026. Patrick handles both inboxes; response hours
are agreed at kickoff. The private onboarding conversation remains available.

## Confirmed hosting choice

User confirmed Vercel; use `https://pullprix.com` as the MVP origin for landing
page and app routes. `vercel.json` specifies the Vite build, `dist` output and
SPA deep-link fallback. Vercel is disclosed in the privacy page. `.vercel` is
ignored. No local Vercel project linkage or Vercel CLI was found during inspection;
no deployment or production origin switch was performed. Obtain the existing
Vercel project link/access before coordinating the cutover.

GitHub API rechecked the app owner as `Pull-Prix`, slug `pull-prix-dev`, with
Contents/Members/Metadata/Pull requests read-only. That metadata endpoint did not
confirm installation visibility. The recorded registration is owner-only; verify
“Only on this account” versus “Any account” in the app's Advanced settings before
installing into a fresh test organization. Public app installation eligibility
is separate from public repository visibility and Marketplace listing.

## Before an outside invitation

These are launch checks, not reasons to build more product features:

- Deploy the frontend on an agreed HTTPS domain with SPA fallback for `/sign-in`,
  `/auth/callback`, `/installations/callback`, `/teams/*`, `/privacy`, `/terms`,
  and `/pilot`. A visitor must be able to reload a deep link directly.
- Configure only the public Supabase URL and publishable key in frontend hosting.
  Keep GitHub keys and Supabase secrets exclusively in backend secrets.
- Set the deployed Edge Functions' APP_URL to the exact frontend origin and
  redeploy affected origin-bound auth/setup/product functions together. Preserve
  the current localhost setup until the hosted setup is ready for review.
- Update Supabase allowed redirect URLs/Site URL and the GitHub App setup URL.
  The GitHub sign-in OAuth callback remains the Supabase Auth callback; the
  product callback is `/auth/callback`. Follow `github-sign-in.md` rather than
  replacing the OAuth callback with the website URL.
- Verify GitHub App installation is permitted in the partner's organization.
  The documented development app is private to its owning organization. Choose
  and verify a pilot app/visibility arrangement before sending an outside team
  an installation link. This is not a Marketplace-publication requirement.
- Update policy disclosures for the chosen hosting provider and actual provider
  logs/export retention. Use Pull Prix as the approved pilot operator name;
  add the registered legal name when known. Do not assert an LLC already exists.
- Confirm the pilot contact knows support@pullprix.com and privacy@pullprix.com.
  Delivery and replies were verified by Patrick on October 6, 2026; agree on
  response hours and an urgent contact method at kickoff.
- Run PP-086's rehearsal and record evidence. Do not describe automated tests
  as proof that the full hosted sign-in/install path works for a new team.

## Choose one team

Choose a willing organization owner and a small engineering team with regular
human-authored PRs and formal reviews. Begin with one or two selected repositories.
Confirm they understand the visible team standings, the privacy policy, and that
this is a founder-supported experiment rather than employee performance scoring.
Avoid asking for sensitive example payloads or repository copies during recruitment.
Record the owner, private contact thread, organization, selected repos, kickoff
window and one review-health question the team cares about.

## Kickoff agenda (about 20 minutes)

1. Explain the experiment: does visible review activity make the queue healthier,
   encourage participation and make the team want another season? Scores are not
   a productivity rating or a substitute for thoughtful reviews.
2. Walk through `/pilot`, the requested GitHub read permissions, data visibility,
   raw payload/content disclosure, and how uninstall/deletion works.
3. Owner opens the verified installation link and selects repositories. Time
   setup from beginning installation to dashboard access; note GitHub approval
   waits and import time separately. Target under five minutes for the manager
   path, excluding approval/import waiting.
4. Sign in, verify organization and selected repos, confirm import progress,
   and copy the team link. No manual roster or season-start operation.
5. A second developer opens the link in their own session. Confirm access and
   explain that spectators can view without being placed on the activity roster.
6. Observe a naturally occurring qualifying review and its score; never fabricate
   production reviews to force points. Record delay and any missing evidence.
7. Agree on response hours, urgent contact method and check-in dates. Patrick
   owns incidents, privacy requests and score questions. No 24/7 support promise.

## Team announcement template (draft only; founder/manager sends)

We're trying Pull Prix this season to make our review activity visible and see
whether it helps our review queue. Open [PRIVATE TEAM LINK] and sign in with your
GitHub account. Continue reviewing normally in GitHub; no new review workflow.

The roster comes from recent PR/review activity. Historical imports identify
participants but don't award retroactive season points. Open “How championship
points work” for the rules. Standings show review activity, not overall engineering
performance, and aren't a performance-management score.

Setup/help: [PILOT GUIDE URL]. Privacy: [PRIVACY URL].
Questions or incorrect scores: support@pullprix.com.
Privacy or deletion requests: privacy@pullprix.com.
We'll ask for feedback at kickoff, midpoint and after the season.

## Support triage

Ask for organization, approximate UTC time, screen/error text and a PR link when
relevant. Never request tokens, passwords, screenshots containing credentials, or
raw webhook payloads in a customer thread. Preserve only necessary diagnostic data.

| Symptom | Founder action |
| --- | --- |
| No access | Verify intended GitHub identity, installation state, organization membership/selected-repository proof. Do not bypass authorization. |
| Import stuck | Inspect setup status and existing backfill/job tools. Verified manager retries once; repeated failures go to Patrick. |
| Missing/wrong points | Check published rules, occurrence time, access window, scoring status and known evidence gaps. Use existing safe recomputation; don't manually award points to silence an error. |
| Worker/provider outage | Inspect existing failure visibility, queue age and rate limits; communicate scope and next update time. Resume existing retries/reconciliation when safe. |
| Suspected data exposure | Stop the affected access/processing path, preserve minimal restricted evidence, determine scope, and arrange legal/security assistance and applicable notices. Never promise an unverified all-clear. |
| Uninstall/deletion | Follow `privacy-and-deletion.md`; verify authority and exact target. Confirm completion only after committed purge. Monitor the 24-hour operational target. |

Existing runbooks: `background-jobs-runbook.md`, `repository-backfill.md`,
`github-reconciliation.md`, `reversible-scoring.md`, `team-access.md`,
`season-transitions.md`, `privacy-and-deletion.md`. No operations console is needed.

## Evidence and feedback

Keep a restricted pilot note, not a public repository file containing customer
names, PR links or raw data. Record metric definitions and the window/coverage;
missing history is unavailable, not zero. Use the existing review-health read
model (`review-health-metrics.md`), not improvised parallel scoring.

- Kickoff: baseline available queue health, setup duration, selected repositories,
  eligible participant count, chosen outcome and any missing baseline coverage.
- First working day: did sign-in work, did activity appear, did the scoring rules
  make sense? Record failures and founder assistance.
- Midpoint: review participation, coverage/aging where available; ask whether
  behavior changed and whether standings felt fair or encouraged shallow reviews.
- Finale: saved standings and champions, comparable health measures where
  available, concise manually prepared recap and known data limitations.
- Interview: what was useful, what was confusing, would they run another season,
  and would they pay? Record concrete reasons and required changes.

Do not automate analytics, recap generation, awards or reveal animations until
pilot evidence justifies them. PP-087 begins when the first real team is invited;
PP-086 must first verify the full internal install-to-deletion path.

Validation: 444 application tests pass; production build and lint pass with the
existing bundle-size/Fast Refresh warnings. No backend/schema changes in PP-085;
prior database verification remains 664 assertions. Browser visual QA is
unverified because of the earlier localhost browser-tool restriction.
