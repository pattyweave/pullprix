# Canonical formal review contributions

PP-031 converts submitted and edited GitHub pull-request reviews into
theme-independent facts. Scoring consumes these facts later; the webhook path
does not calculate points.

## Identity and edits

Each formal review has one durable identity:

- `source_type = review`
- `source_github_id = review.id`

The normalizer computes a SHA-256 `source_version` from the review's meaningful
GitHub fields. An exact duplicate produces the same version and is a no-op. An
edited review produces a new version and updates the existing contribution row
instead of creating additional credit.

## Facts retained

- Organization, installation, repository, and pull request.
- Reviewing GitHub user ID.
- `approved`, `changes_requested`, or `commented`.
- Original submission timestamp.
- Whether the review summary contains non-whitespace feedback.
- Commit ID, GitHub review URL, and author association.
- Whether the contribution is currently effective.

The review summary text is used to calculate the source version and feedback
presence, but it is not copied into the contribution ledger. The original
signed webhook payload remains the source record under the webhook retention
policy.

## Deliberate boundaries

- No points or theme concepts are calculated or stored.
- Inline review comments are handled by PP-033.
- Dismissed reviews become ineffective in PP-032.
- Participant eligibility, author exclusion, review-credit windows, and season
  boundaries are applied by scoring rather than the webhook normalizer.

## Privacy

Contribution rows inherit their organization from the active GitHub
installation and repository. Authenticated members can read only their own
organization's rows. Anonymous users cannot read the table, and browser users
cannot invoke the contribution writer.
