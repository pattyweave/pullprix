import type { StoredGitHubDelivery } from "./github-installation.ts"

export type GitHubPullRequestChange = {
  action:
    | "opened"
    | "reopened"
    | "converted_to_draft"
    | "ready_for_review"
    | "edited"
    | "closed"
    | "review_requested"
    | "review_request_removed"
  githubInstallationId: number
  githubRepositoryId: number
  pullRequest: {
    author_github_user_id: number
    closed_at: string | null
    created_at: string
    draft: boolean
    github_pull_request_id: number
    html_url: string
    merged_at: string | null
    number: number
    requested_reviewer_github_ids: number[]
    state: "open" | "closed"
    title: string
    updated_at: string
  }
}

export type GitHubPullRequestLifecycleResult = {
  disposition: "ignored_repository" | "inserted" | "stale" | "updated"
  pull_request_id: string | null
}

const ACTIONS = new Set([
  "opened",
  "reopened",
  "converted_to_draft",
  "ready_for_review",
  "edited",
  "closed",
  "review_requested",
  "review_request_removed",
])

function object(value: unknown, name: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`GitHub pull request payload is missing ${name}`)
  }
  return value as Record<string, unknown>
}

function array(value: unknown, name: string) {
  if (!Array.isArray(value)) {
    throw new Error(`GitHub pull request payload is missing ${name}`)
  }
  return value
}

function positiveInteger(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`GitHub pull request payload has invalid ${name}`)
  }
  return value
}

function string(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`GitHub pull request payload has invalid ${name}`)
  }
  return value
}

function timestamp(value: unknown, name: string, nullable = false) {
  if (nullable && value === null) return null
  const parsed = string(value, name)
  if (Number.isNaN(Date.parse(parsed))) {
    throw new Error(`GitHub pull request payload has invalid ${name}`)
  }
  return parsed
}

export function isPullRequestLifecycleEvent(delivery: StoredGitHubDelivery) {
  return delivery.event_name === "pull_request" &&
    Boolean(delivery.action && ACTIONS.has(delivery.action))
}

export function normalizePullRequestLifecycle(
  delivery: StoredGitHubDelivery,
): GitHubPullRequestChange | null {
  if (!isPullRequestLifecycleEvent(delivery)) return null

  const installation = object(delivery.payload.installation, "installation")
  const repository = object(delivery.payload.repository, "repository")
  const pullRequest = object(delivery.payload.pull_request, "pull_request")
  const author = object(pullRequest.user, "pull_request.user")
  const state = string(pullRequest.state, "pull_request.state")
  if (state !== "open" && state !== "closed") {
    throw new Error("GitHub pull request payload has invalid pull_request.state")
  }
  if (typeof pullRequest.draft !== "boolean") {
    throw new Error("GitHub pull request payload has invalid pull_request.draft")
  }

  const requestedReviewerIds = array(
    pullRequest.requested_reviewers,
    "pull_request.requested_reviewers",
  ).map((value) =>
    positiveInteger(
      object(value, "pull_request.requested_reviewers[]").id,
      "pull_request.requested_reviewers[].id",
    )
  )

  return {
    action: delivery.action as GitHubPullRequestChange["action"],
    githubInstallationId: positiveInteger(installation.id, "installation.id"),
    githubRepositoryId: positiveInteger(repository.id, "repository.id"),
    pullRequest: {
      author_github_user_id: positiveInteger(author.id, "pull_request.user.id"),
      closed_at: timestamp(
        pullRequest.closed_at,
        "pull_request.closed_at",
        true,
      ),
      created_at: timestamp(pullRequest.created_at, "pull_request.created_at")!,
      draft: pullRequest.draft,
      github_pull_request_id: positiveInteger(pullRequest.id, "pull_request.id"),
      html_url: string(pullRequest.html_url, "pull_request.html_url"),
      merged_at: timestamp(
        pullRequest.merged_at,
        "pull_request.merged_at",
        true,
      ),
      number: positiveInteger(pullRequest.number, "pull_request.number"),
      requested_reviewer_github_ids: [...new Set(requestedReviewerIds)]
        .sort((left, right) => left - right),
      state,
      title: string(pullRequest.title, "pull_request.title"),
      updated_at: timestamp(pullRequest.updated_at, "pull_request.updated_at")!,
    },
  }
}
