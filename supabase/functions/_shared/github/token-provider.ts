import { createGitHubAppJwt, importGitHubPrivateKey } from "./jwt.ts"
import type { GitHubInstallationAuthScope } from "./scope-repository.ts"

export const GITHUB_API_VERSION = "2026-03-10"

type Fetch = typeof fetch
type Clock = () => Date

type CachedToken = {
  expiresAt: number
  scopeKey: string
  token: string
}

type InstallationTokenResponse = {
  expires_at: string
  token: string
}

export interface GitHubInstallationTokenProvider {
  get(scope: GitHubInstallationAuthScope): Promise<string>
  invalidate(githubInstallationId: number): void
}

function scopeKey(scope: GitHubInstallationAuthScope) {
  return scope.repository_selection === "all"
    ? "all"
    : `selected:${[...scope.repository_ids].sort((a, b) => a - b).join(",")}`
}

export function createGitHubInstallationTokenProvider(
  appId: string,
  privateKeyPem: string,
  fetchImplementation: Fetch = fetch,
  clock: Clock = () => new Date(),
  githubApiUrl = "https://api.github.com",
): GitHubInstallationTokenProvider {
  const cache = new Map<number, CachedToken>()
  const importedKey = importGitHubPrivateKey(privateKeyPem)

  return {
    async get(scope) {
      if (
        scope.repository_selection === "selected" &&
        scope.repository_ids.length === 0
      ) {
        throw new Error("Selected installation has no active repositories")
      }

      const now = clock()
      const selectedScopeKey = scopeKey(scope)
      const cached = cache.get(scope.github_installation_id)
      if (
        cached &&
        cached.scopeKey === selectedScopeKey &&
        cached.expiresAt - now.getTime() > 5 * 60 * 1000
      ) {
        return cached.token
      }

      const jwt = await createGitHubAppJwt(appId, await importedKey, now)
      const body: Record<string, unknown> = {
        permissions: { pull_requests: "read" },
      }
      if (scope.repository_selection === "selected") {
        body.repository_ids = [...scope.repository_ids].sort((a, b) => a - b)
      }

      const response = await fetchImplementation(
        `${githubApiUrl}/app/installations/${scope.github_installation_id}/access_tokens`,
        {
          method: "POST",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${jwt}`,
            "content-type": "application/json",
            "x-github-api-version": GITHUB_API_VERSION,
          },
          body: JSON.stringify(body),
        },
      )
      if (!response.ok) {
        throw new Error(`GitHub installation token request failed with status ${response.status}`)
      }

      const tokenResponse = (await response.json()) as InstallationTokenResponse
      const expiresAt = Date.parse(tokenResponse.expires_at)
      if (!tokenResponse.token || Number.isNaN(expiresAt) || expiresAt <= now.getTime()) {
        throw new Error("GitHub returned an invalid installation token")
      }

      cache.set(scope.github_installation_id, {
        expiresAt,
        scopeKey: selectedScopeKey,
        token: tokenResponse.token,
      })
      return tokenResponse.token
    },

    invalidate(githubInstallationId) {
      cache.delete(githubInstallationId)
    },
  }
}
