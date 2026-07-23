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
- Participant eligibility, author exclusion, review-credit windows, and season
  boundaries are applied by scoring rather than the webhook normalizer.

## Dismissed reviews

PP-032 makes the existing contribution ineffective instead of deleting it.
The contribution retains:

- Its original review identity and facts.
- `superseded_at` as the dismissal time.
- A deterministic dismissal source version.
- The GitHub user who dismissed the review.

The source version makes duplicate dismissal deliveries a no-op. A late edit
cannot make a dismissed contribution effective again.

The affected pull request receives a
`scoring_recalculation_requested_at` timestamp. PP-040 can consume and clear
that marker when scoring exists. PP-032 does not enqueue an unimplemented job
or calculate points inside the webhook worker.

The signed webhook delivery remains the detailed audit record. Dismissal
metadata on the contribution is enough to explain why and when its scoring
effect was removed without duplicating review or dismissal text.

## Privacy

Contribution rows inherit their organization from the active GitHub
installation and repository. Authenticated members can read only their own
organization's rows. Anonymous users cannot read the table, and browser users
cannot invoke the contribution writer.
