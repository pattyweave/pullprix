# Pull request lifecycle

PP-030 maintains one current, theme-independent snapshot for each pull request
in an authorized repository. It does not calculate points.

## Events handled

- `opened`
- `reopened`
- `converted_to_draft`
- `ready_for_review`
- `edited`
- `closed`, including merged pull requests
- `review_requested`
- `review_request_removed`

Other `pull_request` actions are acknowledged and ignored until a ticket needs
them. They do not fail the webhook job.

## Review-aging clock

- A PR opened as ready starts aging at `created_at`.
- A draft has no `ready_for_review_at`.
- `ready_for_review` starts the clock at the PR's GitHub `updated_at`.
- Converting back to draft clears the clock.
- Reopening a ready PR restarts the clock at the reopen time.
- Ordinary edits preserve the current ready time.

This gives the 24-hour review-health metric one unambiguous timestamp for the
PR's current reviewable period.

## Convergence and privacy

Each snapshot stores GitHub's `updated_at`. Older webhook deliveries are
ignored, and duplicate deliveries update the same row through the stable
repository and GitHub pull-request IDs.

Pull requests inherit the organization from the active installation repository.
Row-level security lets authenticated members read only pull requests belonging
to their organization. Anonymous users cannot read the table, and browser users
cannot invoke the lifecycle writer.

Requested GitHub user IDs are stored as a sorted, deduplicated snapshot. Team
review requests are deferred because the current scoring and roster rules award
individual activity, not team assignments.
