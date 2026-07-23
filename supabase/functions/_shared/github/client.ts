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
