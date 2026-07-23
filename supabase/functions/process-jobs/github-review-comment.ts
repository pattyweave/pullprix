import type { StoredGitHubDelivery } from "./github-installation.ts"

export type GitHubReviewCommentChange = {
  action: "created" | "deleted" | "edited"
  comment: {
    actor_github_user_id: number
    actor_type: string
    author_association: string
    body_present: boolean
    created_at: string
    html_url: string
    in_reply_to_github_id: number | null
    is_bot: boolean
    is_self_authored: boolean
    linked_review_github_id: number | null
    source_github_id: number
    source_version: string
    updated_at: string
  }
  githubInstallationId: number
  githubPullRequestId: number
  githubRepositoryId: number
}

export type GitHubReviewCommentResult = {
  contribution_id: string | null
  disposition:
    | "ignored_installation"
    | "ignored_repository"
    | "inserted"
    | "stale"
    | "unchanged"
    | "updated"
  scoring_recalculation_requested_at: string | null
}

const ACTIONS = new Set(["created", "edited", "deleted"])

function object(value: unknown, name: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`GitHub review comment payload is missing ${name}`)
  }
  return value as Record<string, unknown>
}

function positiveInteger(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`GitHub review comment payload has invalid ${name}`)
  }
  return value
}

function optionalPositiveInteger(value: unknown, name: string) {
  if (value === null || value === undefined) return null
  return positiveInteger(value, name)
}

function string(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`GitHub review comment payload has invalid ${name}`)
  }
  return value
}

function timestamp(value: unknown, name: string) {
  const parsed = string(value, name)
  if (Number.isNaN(Date.parse(parsed))) {
    throw new Error(`GitHub review comment payload has invalid ${name}`)
  }
  return parsed
}

async function version(value: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function isReviewCommentEvent(delivery: StoredGitHubDelivery) {
  return delivery.event_name === "pull_request_review_comment" &&
    Boolean(delivery.action && ACTIONS.has(delivery.action))
}

export async function normalizeReviewComment(
  delivery: StoredGitHubDelivery,
): Promise<GitHubReviewCommentChange | null> {
  if (!isReviewCommentEvent(delivery)) return null

  const installation = object(delivery.payload.installation, "installation")
  const repository = object(delivery.payload.repository, "repository")
  const pullRequest = object(delivery.payload.pull_request, "pull_request")
  const pullRequestAuthor = object(
    pullRequest.user,
    "pull_request.user",
  )
  const comment = object(delivery.payload.comment, "comment")
  const actor = object(comment.user, "comment.user")
  const actorGithubUserId = positiveInteger(actor.id, "comment.user.id")
  const actorType = string(actor.type, "comment.user.type")
  const pullRequestAuthorGithubUserId = positiveInteger(
    pullRequestAuthor.id,
    "pull_request.user.id",
  )
  if (comment.body !== null && typeof comment.body !== "string") {
    throw new Error("GitHub review comment payload has invalid comment.body")
  }
  const body = comment.body ?? ""
  const createdAt = timestamp(comment.created_at, "comment.created_at")
  const updatedAt = timestamp(comment.updated_at, "comment.updated_at")
  const linkedReviewGithubId = optionalPositiveInteger(
    comment.pull_request_review_id,
    "comment.pull_request_review_id",
  )
  const inReplyToGithubId = optionalPositiveInteger(
    comment.in_reply_to_id,
    "comment.in_reply_to_id",
  )
  const sourceGithubId = positiveInteger(comment.id, "comment.id")
  const action = delivery.action as GitHubReviewCommentChange["action"]

  return {
    action,
    comment: {
      actor_github_user_id: actorGithubUserId,
      actor_type: actorType,
      author_association: string(
        comment.author_association,
        "comment.author_association",
      ),
      body_present: Boolean(body.trim()),
      created_at: createdAt,
      html_url: string(comment.html_url, "comment.html_url"),
      in_reply_to_github_id: inReplyToGithubId,
      is_bot: actorType === "Bot",
      is_self_authored: actorGithubUserId === pullRequestAuthorGithubUserId,
      linked_review_github_id: linkedReviewGithubId,
      source_github_id: sourceGithubId,
      source_version: await version({
        action,
        actorGithubUserId,
        actorType,
        body,
        createdAt,
        inReplyToGithubId,
        linkedReviewGithubId,
        sourceGithubId,
        updatedAt,
      }),
      updated_at: updatedAt,
    },
    githubInstallationId: positiveInteger(installation.id, "installation.id"),
    githubPullRequestId: positiveInteger(pullRequest.id, "pull_request.id"),
    githubRepositoryId: positiveInteger(repository.id, "repository.id"),
  }
}
