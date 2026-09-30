# Pull Prix GitHub App Registration

Roadmap ticket: `PP-020`
Status: Development app registered and installed

This document records the reproducible, minimum-permission registration for
the concierge MVP. It contains no credential values.

## Development registration

- Owner: Pull Prix GitHub organization.
- App name: `Pull Prix Dev`.
- Public page: `https://github.com/apps/pull-prix-dev`.
- Homepage URL: `https://pullprix.com`.
- Visibility: private to the owning organization.
- Test installation: only the private `pull-prix-sandbox` repository.
- Callback URL: not configured; user authorization is not part of PP-020.
- Setup URL: PP-051 now implements `/installations/callback`; setting
  `http://127.0.0.1:5173/installations/callback` on the app is pending user setup.
- Webhook delivery enabled; the recreated app's installation event has been
  processed successfully (see Hosted sandbox below).

## Minimum permissions

Repository permissions:

- Metadata: read-only, granted implicitly by GitHub.
- Pull requests: read-only.
- Contents: read-only for PP-041 base-branch metadata (approve the updated
  installation after changing it).
- All other repository permissions: no access.
- Organization permissions: **Members: read-only**, approved by the user and
  verified in the live PP-051 owner-access flow. See
  [installation setup](installation-setup.md).
- Account permissions: no access.

Ingestion through PP-036 only requires Metadata and Pull requests. PP-041's
automatic fallback scoring also needs branch metadata, which GitHub places
under Contents read access. This permission technically allows reading code,
but Pull Prix does not call source-content endpoints, comment on pull requests,
assign reviewers, merge changes, or modify customer repositories. See
[reversible scoring](reversible-scoring.md) for the permission and live test.

## Webhook subscriptions

GitHub Apps receive `installation` and `installation_repositories` lifecycle
events by default. With PP-022 through PP-033 deployed, enable webhook
delivery, verify `installation_target` rename delivery is available, and
subscribe to `repository` for repository creation, rename, and transfer events.

Also subscribe to the implemented product events:

- `pull_request` — PP-030.
- `pull_request_review` — PP-031.
- `pull_request_review_comment` — PP-033 (review context, not points for raw
  diff-comment volume).

## Hosted sandbox

- Supabase project reference: `tfniygqihihmcuitydde`.
- Project API URL: `https://tfniygqihihmcuitydde.supabase.co`.
- Webhook URL:
  `https://tfniygqihihmcuitydde.supabase.co/functions/v1/github-webhook`.
- All eleven migrations through `20260723040000_pp033_review_comments.sql`
  have been applied, plus `20260925000000_fix_installation_deletion.sql` and
  `20260925010000_pp034_participant_resolution.sql`.
- `health`, `github-webhook`, and `process-jobs` have been deployed.
- The hosted `GITHUB_WEBHOOK_SECRET` matches the ignored local environment
  file. The GitHub App must use that same webhook secret.
- Hosted smoke checks passed on 2026-09-25: health HTTP 200, unsigned webhook
  HTTP 401, signed delivery HTTP 202, duplicate delivery recognition, and
  automatic processing of both a `system.noop` job and a harmless ignored
  repository event. Both jobs succeeded on their first attempt through the
  once-per-minute Cron schedule; no manual worker invocation processed them.

For a new registration, enable **Active** in the app's webhook settings, set
the webhook URL above, and enable the event subscriptions listed above. Keep
SSL verification enabled. The current development registration is connected.

If an installation predates the hosted database, after enabling webhooks
redeliver its `installation.created` event if it is still available
in GitHub's recent deliveries. Otherwise, uninstall and reinstall only the
development app with access to `pull-prix-sandbox` to generate a fresh
installation event. Changing the repository selection alone is not sufficient
to initialize the missing installation record.

Live verification on 2026-09-25 confirmed:

- Replacement installation `164945891` is active and owns the active
  `Pull-Prix/pull-prix-sandbox` repository record.
- Deleted installation `148357947` is now deleted after reapplying its stored
  deletion event through the corrected lifecycle function. Its original job
  history remains unchanged; that job had previously succeeded as stale.
- Both failed GitHub connectivity pings were replayed through the scheduled
  worker and completed as ignored no-ops. No failed webhook deliveries remain
  at this verification point.
- The Pull-Prix organization remains active.

Then create a sandbox PR and submit a review from another GitHub account;
check the webhook delivery, background job, installation, repository, PR, and
review records before treating the real GitHub integration as verified.

On 2026-09-26, the recreated app's local credentials authenticated successfully
and listed only `Pull-Prix/pull-prix-sandbox` for installation `164945891`,
completing PP-025's live verification. On 2026-09-27, PP-035 and PP-036 were
deployed and verified end to end; see `repository-backfill.md` and
`github-reconciliation.md` for the recorded outcomes.

## Credential handling

The development registration has:

- A GitHub App ID.
- One downloaded RSA private key.
- One random webhook secret.

Local values live only in the ignored `supabase/functions/.env` file, whose
permissions are restricted to the local owner. The webhook secret is also
configured in hosted Supabase Edge Function secrets. With explicit user approval,
the app ID/private key were uploaded to hosted function secrets on 2026-09-27
for server-side backfill and reconciliation. Never add the PEM,
webhook secret, or installation access tokens to this repository.

The private key authenticates Pull Prix as the GitHub App. The independent
webhook secret verifies the raw bytes of incoming GitHub webhook requests.

## Future registrations

Create a separate production registration only when the real installation flow
is ready for a design partner. Use this document as the settings checklist and
choose installability by any account at that time. Do not reuse development
private keys or webhook secrets in production.
