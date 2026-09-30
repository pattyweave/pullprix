import type {
  GitHubInstallationRepository,
  InstallationLifecycleChange,
  InstallationLifecycleResult,
  StoredGitHubDelivery,
} from "./github-installation.ts"
import type { GitHubRepositoryChange } from "./github-repository.ts"
import type { GitHubPullRequestChange } from "./github-pull-request.ts"
import type { GitHubReviewCommentChange } from "./github-review-comment.ts"
import type { GitHubReviewContributionChange } from "./github-review.ts"
import type { GitHubReviewDismissalChange } from "./github-review.ts"

type Fetch = typeof fetch

export function createGitHubInstallationRepository(
  supabaseUrl: string,
  secretKey: string,
  fetchImplementation: Fetch = fetch,
): GitHubInstallationRepository {
  const headers: Record<string, string> = {
    apikey: secretKey,
    "content-type": "application/json",
  }
  if (secretKey.startsWith("eyJ")) {
    headers.authorization = `Bearer ${secretKey}`
  }

  return {
    async startBackfills(githubInstallationId) {
      const response = await fetchImplementation(`${supabaseUrl}/rest/v1/rpc/start_installation_backfills`, {
        method: "POST", headers, body: JSON.stringify({ p_github_installation_id: githubInstallationId }),
      })
      if (!response.ok) throw new Error(`Backfill scheduling failed with status ${response.status}`)
    },
    async resolveParticipants(deliveryId) {
      const response = await fetchImplementation(
        `${supabaseUrl}/rest/v1/rpc/resolve_github_delivery_participants`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ p_delivery_id: deliveryId }),
        },
      )
      if (!response.ok) {
        throw new Error(`Participant resolution failed with status ${response.status}`)
      }
    },

    async getDelivery(deliveryId) {
      const response = await fetchImplementation(
        `${supabaseUrl}/rest/v1/rpc/get_github_delivery_for_processing`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ p_delivery_id: deliveryId }),
        },
      )
      if (!response.ok) {
        throw new Error(`Delivery lookup failed with status ${response.status}`)
      }

      const deliveries = (await response.json()) as StoredGitHubDelivery[]
      const delivery = deliveries[0]
      if (!delivery) throw new Error("GitHub delivery not found")
      return delivery
    },

    async isActive(githubInstallationId) {
      const response = await fetchImplementation(
        `${supabaseUrl}/rest/v1/rpc/is_github_installation_active`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_github_installation_id: githubInstallationId,
          }),
        },
      )
      if (!response.ok) {
        throw new Error(`Installation status lookup failed with status ${response.status}`)
      }

      return (await response.json()) as boolean
    },

    async applyRepositories(change: GitHubRepositoryChange) {
      const response = await fetchImplementation(
        `${supabaseUrl}/rest/v1/rpc/apply_github_repository_changes`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_event_at: change.eventAt,
            p_github_installation_id: change.githubInstallationId,
            p_repositories: change.repositories,
            p_repository_selection: change.repositorySelection,
          }),
        },
      )
      if (!response.ok) {
        throw new Error(`Repository changes apply failed with status ${response.status}`)
      }

      return (await response.json()) as number
    },

    async applyPullRequest(change: GitHubPullRequestChange) {
      const response = await fetchImplementation(
        `${supabaseUrl}/rest/v1/rpc/apply_github_pull_request_lifecycle`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_action: change.action,
            p_github_installation_id: change.githubInstallationId,
            p_github_repository_id: change.githubRepositoryId,
            p_pull_request: change.pullRequest,
          }),
        },
      )
      if (!response.ok) {
        throw new Error(`Pull request lifecycle apply failed with status ${response.status}`)
      }

      const results = (await response.json()) as Array<{
        disposition: "ignored_repository" | "inserted" | "stale" | "updated"
        pull_request_id: string | null
      }>
      const result = results[0]
      if (!result) throw new Error("Pull request lifecycle change returned no result")
      return result
    },

    async applyReviewContribution(change: GitHubReviewContributionChange) {
      const response = await fetchImplementation(
        `${supabaseUrl}/rest/v1/rpc/apply_github_review_contribution`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_github_installation_id: change.githubInstallationId,
            p_github_pull_request_id: change.githubPullRequestId,
            p_github_repository_id: change.githubRepositoryId,
            p_review: change.review,
          }),
        },
      )
      if (!response.ok) {
        throw new Error(`Review contribution apply failed with status ${response.status}`)
      }

      const results = (await response.json()) as Array<{
        contribution_id: string | null
        disposition:
          | "ignored_installation"
          | "ignored_repository"
          | "inserted"
          | "unchanged"
          | "updated"
      }>
      const result = results[0]
      if (!result) throw new Error("Review contribution returned no result")
      return result
    },

    async applyReviewComment(change: GitHubReviewCommentChange) {
      const response = await fetchImplementation(
        `${supabaseUrl}/rest/v1/rpc/apply_github_review_comment`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_action: change.action,
            p_comment: change.comment,
            p_github_installation_id: change.githubInstallationId,
            p_github_pull_request_id: change.githubPullRequestId,
            p_github_repository_id: change.githubRepositoryId,
          }),
        },
      )
      if (!response.ok) {
        throw new Error(`Review comment apply failed with status ${response.status}`)
      }

      const results = (await response.json()) as Array<{
        contribution_id: string | null
        disposition:
          | "ignored_installation"
          | "ignored_repository"
          | "inserted"
          | "stale"
          | "unchanged"
          | "updated"
        scoring_recalculation_requested_at: string | null
      }>
      const result = results[0]
      if (!result) throw new Error("Review comment returned no result")
      return result
    },

    async applyReviewDismissal(change: GitHubReviewDismissalChange) {
      const response = await fetchImplementation(
        `${supabaseUrl}/rest/v1/rpc/dismiss_github_review_contribution`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_dismissal: change.dismissal,
            p_github_installation_id: change.githubInstallationId,
            p_github_pull_request_id: change.githubPullRequestId,
            p_github_repository_id: change.githubRepositoryId,
          }),
        },
      )
      if (!response.ok) {
        throw new Error(`Review dismissal apply failed with status ${response.status}`)
      }

      const results = (await response.json()) as Array<{
        contribution_id: string | null
        disposition:
          | "dismissed"
          | "ignored_installation"
          | "ignored_repository"
          | "unchanged"
        scoring_recalculation_requested_at: string | null
      }>
      const result = results[0]
      if (!result) throw new Error("Review dismissal returned no result")
      return result
    },

    async apply(change: InstallationLifecycleChange) {
      const response = await fetchImplementation(
        `${supabaseUrl}/rest/v1/rpc/apply_github_installation_lifecycle`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_account_id: change.accountId,
            p_account_login: change.accountLogin,
            p_account_type: change.accountType,
            p_action: change.action,
            p_github_installation_id: change.githubInstallationId,
            p_github_updated_at: change.githubUpdatedAt,
            p_installed_at: change.installedAt,
            p_suspended_at: change.suspendedAt,
          }),
        },
      )
      if (!response.ok) {
        throw new Error(`Installation lifecycle apply failed with status ${response.status}`)
      }

      const results = (await response.json()) as InstallationLifecycleResult[]
      const result = results[0]
      if (!result) throw new Error("Installation lifecycle change returned no result")
      return result
    },
  }
}
