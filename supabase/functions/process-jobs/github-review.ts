import type { StoredGitHubDelivery } from "./github-installation.ts"

export type GitHubReviewContributionChange = {
  githubInstallationId: number
  githubPullRequestId: number
  githubRepositoryId: number
  review: {
    actor_github_user_id: number
    author_association: string
    body_present: boolean
    commit_id: string
    html_url: string
    occurred_at: string
    review_state: "approved" | "changes_requested" | "commented" | "dismissed"
    source_github_id: number
    source_version: string
  }
}

export type GitHubReviewContributionResult = {
  contribution_id: string | null
  disposition:
    | "ignored_installation"
    | "ignored_repository"
    | "inserted"
    | "unchanged"
    | "updated"
}

export type GitHubReviewDismissalChange = {
  dismissal: {
    dismissed_at: string
    dismissed_by_github_user_id: number
    reviewer_github_user_id: number
    source_github_id: number
    source_version: string
  }
  githubInstallationId: number
  githubPullRequestId: number
  githubRepositoryId: number
}

export type GitHubReviewDismissalResult = {
  contribution_id: string | null
  disposition:
    | "dismissed"
    | "ignored_installation"
    | "ignored_repository"
    | "unchanged"
  scoring_recalculation_requested_at: string | null
}

const ACTIONS = new Set(["submitted", "edited"])
const STATES = new Set(["approved", "changes_requested", "commented"])

function object(value: unknown, name: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`GitHub review payload is missing ${name}`)
  }
  return value as Record<string, unknown>
}

function positiveInteger(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`GitHub review payload has invalid ${name}`)
  }
  return value
}

function string(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`GitHub review payload has invalid ${name}`)
  }
  return value
}

function timestamp(value: unknown, name: string) {
  const parsed = string(value, name)
  if (Number.isNaN(Date.parse(parsed))) {
    throw new Error(`GitHub review payload has invalid ${name}`)
  }
  return parsed
}

async function version(value: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function isReviewContributionEvent(delivery: StoredGitHubDelivery) {
  return delivery.event_name === "pull_request_review" &&
    Boolean(delivery.action && ACTIONS.has(delivery.action))
}

export function isReviewDismissalEvent(delivery: StoredGitHubDelivery) {
  return delivery.event_name === "pull_request_review" &&
    delivery.action === "dismissed"
}

export async function normalizeReviewDismissal(
  delivery: StoredGitHubDelivery,
): Promise<GitHubReviewDismissalChange | null> {
  if (!isReviewDismissalEvent(delivery)) return null

  const installation = object(delivery.payload.installation, "installation")
  const repository = object(delivery.payload.repository, "repository")
  const pullRequest = object(delivery.payload.pull_request, "pull_request")
  const review = object(delivery.payload.review, "review")
  const reviewer = object(review.user, "review.user")
  const sender = object(delivery.payload.sender, "sender")
  const state = string(review.state, "review.state").toLowerCase()
  if (state !== "dismissed") {
    throw new Error("GitHub review payload has invalid review.state")
  }

  const sourceGithubId = positiveInteger(review.id, "review.id")
  const reviewerGithubUserId = positiveInteger(reviewer.id, "review.user.id")
  const dismissedByGithubUserId = positiveInteger(sender.id, "sender.id")
  // GitHub supplies no dismissal time; retain our durable receipt observation.
  // The PR snapshot may still carry the original approval timestamp.
  const dismissedAt = timestamp(delivery.received_at, "received_at")

  return {
    dismissal: {
      dismissed_at: dismissedAt,
      dismissed_by_github_user_id: dismissedByGithubUserId,
      reviewer_github_user_id: reviewerGithubUserId,
      source_github_id: sourceGithubId,
      source_version: await version({
        dismissedAt,
        dismissedByGithubUserId,
        reviewerGithubUserId,
        sourceGithubId,
        state,
      }),
    },
    githubInstallationId: positiveInteger(installation.id, "installation.id"),
    githubPullRequestId: positiveInteger(pullRequest.id, "pull_request.id"),
    githubRepositoryId: positiveInteger(repository.id, "repository.id"),
  }
}

export async function normalizeReviewContribution(
  delivery: StoredGitHubDelivery,
  allowDismissedSnapshot = false,
): Promise<GitHubReviewContributionChange | null> {
  if (!isReviewContributionEvent(delivery)) return null

  const installation = object(delivery.payload.installation, "installation")
  const repository = object(delivery.payload.repository, "repository")
  const pullRequest = object(delivery.payload.pull_request, "pull_request")
  const review = object(delivery.payload.review, "review")
  const actor = object(review.user, "review.user")
  const rawState = string(review.state, "review.state").toLowerCase()
  if (!STATES.has(rawState) && !(allowDismissedSnapshot && rawState === "dismissed")) {
    throw new Error("GitHub review payload has invalid review.state")
  }

  const sourceGithubId = positiveInteger(review.id, "review.id")
  const actorGithubUserId = positiveInteger(actor.id, "review.user.id")
  const occurredAt = timestamp(review.submitted_at, "review.submitted_at")
  const commitId = string(review.commit_id, "review.commit_id")
  const htmlUrl = string(review.html_url, "review.html_url")
  const authorAssociation = string(
    review.author_association,
    "review.author_association",
  )
  if (review.body !== null && typeof review.body !== "string") {
    throw new Error("GitHub review payload has invalid review.body")
  }
  const body = review.body ?? ""

  return {
    githubInstallationId: positiveInteger(installation.id, "installation.id"),
    githubPullRequestId: positiveInteger(pullRequest.id, "pull_request.id"),
    githubRepositoryId: positiveInteger(repository.id, "repository.id"),
    review: {
      actor_github_user_id: actorGithubUserId,
      author_association: authorAssociation,
      body_present: Boolean(body.trim()),
      commit_id: commitId,
      html_url: htmlUrl,
      occurred_at: occurredAt,
      review_state: rawState as GitHubReviewContributionChange["review"]["review_state"],
      source_github_id: sourceGithubId,
      source_version: await version({
        actorGithubUserId,
        authorAssociation,
        body,
        commitId,
        htmlUrl,
        occurredAt,
        reviewState: rawState,
      }),
    },
  }
}
