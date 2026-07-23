# Canonical review comments

PP-033 normalizes inline pull-request diff comments. General PR conversation
comments remain excluded.

## Canonical identity

Each GitHub review comment has one ledger record:

- `source_type = review_comment`
- `source_github_id = comment.id`
- `action = inline_comment`

A SHA-256 source version covers the meaningful GitHub fields. Duplicate
deliveries are no-ops, edits update the existing row, and deletions make that
row ineffective. GitHub's `updated_at` prevents an older create or edit from
overwriting a newer state.

The comment stores its `pull_request_review_id` when GitHub provides one. This
lets scoring later answer the only needed feedback question: whether a formal
review has at least one effective, non-empty inline comment.

## Privacy-minimized facts

The canonical ledger stores:

- Comment, pull request, repository, organization, and actor identity.
- Created and updated timestamps.
- Whether the body contains non-whitespace feedback.
- Associated formal review and reply IDs when available.
- GitHub URL and author association.
- Actor type plus bot and self-authored flags.
- Effective or deleted state.

It does not store:

- Comment body.
- Body length.
- Diff hunks or file paths.
- Comment count.
- A quality score.
- Championship points.

The signed raw webhook remains the source record under the webhook retention
policy.

## Scoring boundary

One effective comment can establish feedback presence for its associated formal
review. More comments, longer comments, replies, edits, and raw comment volume
never add more value by themselves.

Bot and self-authored comments remain auditable facts. PP-034 applies
participant and self-review exclusions rather than deleting those facts during
normalization.

Any material comment change updates the PR's existing
`scoring_recalculation_requested_at` marker. No scoring job or point
calculation is introduced by PP-033.
