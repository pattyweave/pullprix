import {
  GitHubRateLimitError,
  readGitHubRateLimit,
} from "./rate-limit.ts"
import type { GitHubRateLimit } from "./rate-limit.ts"
import type { GitHubInstallationScopeRepository } from "./scope-repository.ts"
import {
  GITHUB_API_VERSION,
} from "./token-provider.ts"
import type { GitHubInstallationTokenProvider } from "./token-provider.ts"

type Fetch = typeof fetch

type RepositoryPage = {
  repositories: Array<Record<string, unknown>>
  total_count: number
}

export type GitHubRepositoryList = {
  rateLimit: GitHubRateLimit
  repositories: Array<Record<string, unknown>>
}

export function createGitHubApiClient(
  scopes: GitHubInstallationScopeRepository,
  tokens: GitHubInstallationTokenProvider,
  fetchImplementation: Fetch = fetch,
  githubApiUrl = "https://api.github.com",
) {
  async function getRepositoryPage(
    token: string,
    page: number,
  ) {
    return fetchImplementation(
      `${githubApiUrl}/installation/repositories?per_page=100&page=${page}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": GITHUB_API_VERSION,
        },
      },
    ).then(async (response) => {
      const rateLimit = readGitHubRateLimit(response.headers)
      if (
        (response.status === 403 || response.status === 429) &&
        (rateLimit.retryAfterSeconds !== null || rateLimit.remaining === 0)
      ) {
        throw new GitHubRateLimitError(rateLimit)
      }
      if (!response.ok) {
        return { page: null, rateLimit, response }
      }
      return {
        page: (await response.json()) as RepositoryPage,
        rateLimit,
        response,
      }
    })
  }

  return {
    async readReviewGate(githubInstallationId: number, githubRepositoryId: number,
      owner: string, repository: string, pullNumber: number) {
      if (!/^[a-zA-Z0-9-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repository) ||
        !Number.isSafeInteger(pullNumber) || pullNumber < 1) throw new Error("Invalid review gate scope")
      const scope = await scopes.get(githubInstallationId)
      if (!scope.repository_ids.includes(githubRepositoryId)) throw new Error("Review gate repository is not active")
      const rulesUnavailableForPlan = Symbol("rules unavailable for repository plan")
      async function request(path: string, body?: Record<string, unknown>) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const token = await tokens.get(scope)
          const response = await fetchImplementation(`${githubApiUrl}${path}`, {
            method: body ? "POST" : "GET", headers: { accept: "application/vnd.github+json",
              authorization: `Bearer ${token}`, "content-type": "application/json", "x-github-api-version": GITHUB_API_VERSION },
            ...(body && { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000), redirect: "error",
          })
          if (response.status === 401 && attempt === 0) { tokens.invalidate(githubInstallationId); continue }
          const rateLimit = readGitHubRateLimit(response.headers)
          if (response.status === 429 || (response.status === 403 && (rateLimit.remaining === 0 || rateLimit.retryAfterSeconds !== null))) {
            throw new GitHubRateLimitError(rateLimit)
          }
          // GitHub Free private repositories cannot enable rulesets. Recognize
          // only the explicit feature-unavailable response on the rules route;
          // permission denials and rate limits must never become "no rules".
          if (response.status === 403 && path.includes("/rules/branches/")) {
            const error = await response.json().catch(() => null)
            if (error?.message === "Upgrade to GitHub Pro or make this repository public to enable this feature.") {
              return rulesUnavailableForPlan
            }
          }
          // Missing permission/rules visibility is unknown, not "no rules".
          if (response.status === 403 || response.status === 404) return null
          if (!response.ok) throw new Error(`GitHub review gate request failed with status ${response.status}`)
          return response.json()
        }
        throw new Error("GitHub review gate authentication failed")
      }
      const value = await request("/graphql", {
        query: `query($owner:String!,$name:String!,$number:Int!) { repository(owner:$owner,name:$name) {
          pullRequest(number:$number) { headRefOid baseRefName reviewDecision
            baseRef { branchProtectionRule { requiresApprovingReviews } }
            reviews(last:1,states:[APPROVED,CHANGES_REQUESTED,COMMENTED,DISMISSED]) { nodes { databaseId } }
          } } }`, variables: { owner, name: repository, number: pullNumber },
      })
      if (!value?.data?.repository?.pullRequest) return null
      const pr = value.data.repository.pullRequest
      if (typeof pr.headRefOid !== "string" || typeof pr.baseRefName !== "string" || !Array.isArray(pr.reviews?.nodes)) return null
      let credit: "required" | "satisfied" | "unconfigured" | "unknown" = "unknown"
      if (pr.reviewDecision === "APPROVED") credit = "satisfied"
      if (["REVIEW_REQUIRED", "CHANGES_REQUESTED"].includes(pr.reviewDecision)) credit = "required"
      if (pr.reviewDecision === null) {
        const classicVisible = !value.errors?.some((error: { path?: unknown[] }) => error.path?.includes("baseRef"))
        let noClassicReviews = classicVisible && pr.baseRef &&
          (pr.baseRef.branchProtectionRule === null || pr.baseRef.branchProtectionRule?.requiresApprovingReviews === false)
        if (!noClassicReviews) {
          const branch = await request(`/repos/${owner}/${repository}/branches/${encodeURIComponent(pr.baseRefName)}`)
          noClassicReviews = branch?.protected === false
        }
        const rules = await request(`/repos/${owner}/${repository}/rules/branches/${encodeURIComponent(pr.baseRefName)}?per_page=100`)
        if (noClassicReviews && (rules === rulesUnavailableForPlan ||
          (Array.isArray(rules) && rules.length < 100 && !rules.some(rule => rule.type === "pull_request")))) credit = "unconfigured"
      }
      return { headSha: pr.headRefOid as string, latestReviewGithubId: pr.reviews.nodes[0]?.databaseId ?? null, credit }
    },
    async readBackfillPage(
      githubInstallationId: number, githubRepositoryId: number,
      owner: string, repository: string, kind: "pulls" | "reviews" | "comments",
      page: number, pullNumber?: number,
    ): Promise<{ items: Array<Record<string, unknown>>; hasNext: boolean; rateLimit: GitHubRateLimit }> {
      if (!Number.isSafeInteger(page) || page < 1 ||
        !/^[a-zA-Z0-9-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repository) ||
        (kind !== "pulls" && (!Number.isSafeInteger(pullNumber) || pullNumber! < 1))) {
        throw new Error("Invalid GitHub backfill cursor")
      }
      const scope = await scopes.get(githubInstallationId)
      if (!scope.repository_ids.includes(githubRepositoryId)) throw new Error("GitHub backfill repository is not active")
      const suffix = kind === "pulls" ? "" : `/${pullNumber}/${kind}`
      const query = kind === "pulls" ? "&state=all&sort=updated&direction=desc" : ""
      const url = `${githubApiUrl}/repos/${owner}/${repository}/pulls${suffix}?per_page=20&page=${page}${query}`
      let token = await tokens.get(scope)
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetchImplementation(url, {
          headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`,
            "x-github-api-version": GITHUB_API_VERSION },
          signal: AbortSignal.timeout(20000), redirect: "error",
        })
        if (response.status === 401 && attempt === 0) {
          tokens.invalidate(githubInstallationId)
          token = await tokens.get(scope)
          continue
        }
        const rateLimit = readGitHubRateLimit(response.headers)
        if (response.status === 429 || (response.status === 403 &&
          (rateLimit.retryAfterSeconds !== null || rateLimit.remaining === 0))) throw new GitHubRateLimitError(rateLimit)
        if (!response.ok) throw new Error(`GitHub backfill request failed with status ${response.status}`)
        const items: unknown = await response.json()
        if (!Array.isArray(items) || items.length > 20 || items.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
          throw new Error("Invalid GitHub backfill page")
        }
        return { items, hasNext: /rel="next"/.test(response.headers.get("link") ?? ""), rateLimit }
      }
      throw new Error("GitHub backfill authentication failed")
    },

    async listInstallationRepositories(
      githubInstallationId: number,
    ): Promise<GitHubRepositoryList> {
      const scope = await scopes.get(githubInstallationId)
      let token = await tokens.get(scope)
      const repositories: Array<Record<string, unknown>> = []
      let pageNumber = 1
      let lastRateLimit: GitHubRateLimit = {
        limit: null,
        remaining: null,
        resetAt: null,
        resource: null,
        retryAfterSeconds: null,
        used: null,
      }

      while (true) {
        let result = await getRepositoryPage(
          token,
          pageNumber,
        )
        if (result.response.status === 401) {
          tokens.invalidate(githubInstallationId)
          token = await tokens.get(scope)
          result = await getRepositoryPage(
            token,
            pageNumber,
          )
        }
        if (!result.page) {
          throw new Error(`GitHub repository list failed with status ${result.response.status}`)
        }

        lastRateLimit = result.rateLimit
        repositories.push(...result.page.repositories)
        if (
          repositories.length >= result.page.total_count ||
          result.page.repositories.length < 100
        ) {
          return { rateLimit: lastRateLimit, repositories }
        }
        pageNumber += 1
      }
    },
  }
}
