# Participant resolution

Roadmap ticket: `PP-034`. Product policy: [PP-002](participant-eligibility.md).

## What runs automatically

After persisting a PR lifecycle event or a submitted/edited formal review, the
worker calls `resolve_github_delivery_participants` with the stored delivery ID.
The resolver matches the event to its canonical PR/review and active selected
repository, installation, and organization. It resolves the PR author and,
for formal reviews, the reviewer—not the sender or requested reviewers.

- GitHub numeric ID is the stable identity; login and avatar can change.
- Human authors and formal reviewers with activity in the last 60 days join.
- Contractors/outside collaborators use the same rule as organization members.
- Duplicate delivery processing reuses identities and participants.
- An older metadata observation cannot overwrite a newer identity.
- Inline comments, discussion comments, invitations, and review requests alone
  do not add people to the roster.
- Roster creation does not grant organization membership or authentication.

The 60-day filter controls **new additions**, not daily removal of participants
who have not reviewed. Existing participant history is retained. Initial GitHub
history fetching belongs to PP-035; this ticket can resolve retained deliveries
without requesting new GitHub API permissions or using the app private key.

## Exclusions and corrections

GitHub `Bot` accounts, `[bot]` logins (including Pull Prix's app), nonhuman
organization accounts, `ghost`, and accounts with supplied suspension metadata
are excluded automatically. Their canonical PR/review facts and identities remain
stored. They do not get a new participant row; an existing participant becomes
ineligible if its identity later becomes excluded.

GitHub does not reliably label a human-shaped service account as automation,
and ordinary review payloads do not provide a complete account/access-status
feed. Do not guess from a person's name or author association. For the concierge
MVP, the operator may correct a known service, suspended, or deleted account:

```sql
select public.set_github_user_exclusion(
  123456, 'service_account', 'Confirmed team automation account'
);

-- Clear a mistaken correction; normal GitHub bot checks still apply.
select public.set_github_user_exclusion(
  123456, null, 'Verified this is a human developer'
);
```

This is service-role/operator-only, not manager configuration or individual
opt-out. Corrections persist through webhook refreshes, update participant
eligibility, and request score recalculation on affected PRs. They never delete
or rewrite canonical reviews. A participant's stable ID and history survive.

Known departures use the existing `participants.active = false` and `left_at`
fields; webhook replay never reactivates that row. Access-loss discovery and
restoration are not inferred from lack of activity. Repository/installation
removal immediately prevents new resolution in that scope.

## Boundary for the future scorer

`review_participant_exclusion_reason(contribution_id)` returns a reason or null.
It checks formal/effective reviews, self-review, excluded authors/reviewers,
organization-scoped participant membership, and departure timing. Reviews before
a recorded departure retain their participant eligibility.

**Null is not a points award or a complete scoring verdict.** PP-040 must still
apply season/repository inclusion, review-credit windows, draft timing, review
caps, feedback, and bonuses. No `score_eligible` flag is frozen on the facts.
No points, standings UI, or season progress state are introduced by PP-034.

## Verification

Local tests cover author-only participation, outside reviewers, self-review,
bot reviewers and bot-authored PRs, excluded identities, reversible corrections,
60-day boundaries, retained facts, replay, departed participants, identity
updates, removed access scopes, cross-tenant mismatch, and RPC permissions.

The resolver may safely be run against a retained **processed** delivery to
populate the initial sandbox roster without changing original job history:

```sql
select public.resolve_github_delivery_participants('STORED_DELIVERY_ROW_UUID');
```

Use `webhook_deliveries.id`, not `github_delivery_id`. Resolve only supported PR
or formal-review deliveries. This is founder setup for existing data; future
worker deliveries call it automatically and retry on a resolution failure.

### Hosted sandbox verification — 2026-09-26

Migration `20260925010000_pp034_participant_resolution.sql` and the updated
`process-jobs` worker are deployed to `tfniygqihihmcuitydde`. Two bounded
verification jobs reprocessed the existing signed PR #1 opening and approval
deliveries through the scheduled worker; both succeeded on the first attempt.
The original delivery/job history was left intact.

- `pattyweave` and `Hollistud` are active, eligible participants.
- PR #1 remains closed/merged; its one approval remains effective.
- The approval's participant-exclusion reason is null (not a points award).
- No authentication memberships were granted.

Local validation: 123 application tests, 353 database assertions, build, and
focused worker type checks pass. Lint has only the existing frontend warnings.
