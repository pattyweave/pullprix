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
- Setup URL: not configured; the installation return flow belongs to its
  implementation ticket.
- Webhook delivery: disabled until PP-021 deploys signature verification.

## Minimum permissions

Repository permissions:

- Metadata: read-only, granted implicitly by GitHub.
- Pull requests: read-only.
- All other repository permissions: no access.
- Organization permissions: no access.
- Account permissions: no access.

No Contents permission is required. Pull Prix does not read source code,
comment on pull requests, assign reviewers, merge changes, or modify customer
repositories.

## Webhook subscriptions

Enable these when the PP-021 endpoint is ready:

- `installation`
- `installation_repositories`
- `pull_request`
- `pull_request_review`

`pull_request_review_comment` remains deferred with PP-033 because the
concierge scoring policy does not score raw diff-comment volume.

## Credential handling

The development registration has:

- A GitHub App ID.
- One downloaded RSA private key.
- One random webhook secret.

Local values live only in the ignored `supabase/functions/.env` file, whose
permissions are restricted to the local owner. Hosted values will use Supabase
Edge Function secrets when a hosted project is configured. Never add the PEM,
webhook secret, or installation access tokens to this repository.

The private key authenticates Pull Prix as the GitHub App. The independent
webhook secret verifies the raw bytes of incoming GitHub webhook requests.

## Future registrations

Create a separate production registration only when the real installation flow
is ready for a design partner. Use this document as the settings checklist and
choose installability by any account at that time. Do not reuse development
private keys or webhook secrets in production.
