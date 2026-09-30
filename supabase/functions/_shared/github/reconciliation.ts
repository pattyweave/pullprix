import { createGitHubAppJwt, importGitHubPrivateKey } from "./jwt.ts"
import { GITHUB_API_VERSION } from "./token-provider.ts"
import { GitHubRateLimitError, readGitHubRateLimit } from "./rate-limit.ts"

type ObjectValue = Record<string, unknown>
export type InstallationSnapshot = { installation: ObjectValue | null; repositories: ObjectValue[] }

// Discovery must not restrict its token to our potentially stale local repo list.
// GitHub still restricts it to the installation's currently authorized repos.
export function createGitHubReconciliationClient(appId: string, pem: string, request: typeof fetch = fetch,
  base = "https://api.github.com") {
  const key = importGitHubPrivateKey(pem)
  return {
    async snapshot(installationId: number): Promise<InstallationSnapshot> {
      if (!Number.isSafeInteger(installationId) || installationId <= 0) throw new Error("Invalid installation ID")
      const deadline = AbortSignal.timeout(40_000)
      const jwt = await createGitHubAppJwt(appId, await key)
      async function call(path: string, token: string, body?: ObjectValue) {
        const response = await request(`${base}${path}`, {
          method: body ? "POST" : "GET", redirect: "error", signal: deadline,
          headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`,
            "x-github-api-version": GITHUB_API_VERSION, "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })
        const rate = readGitHubRateLimit(response.headers)
        if (response.status === 429 || (response.status === 403 && (rate.remaining === 0 || rate.retryAfterSeconds !== null))) {
          throw new GitHubRateLimitError(rate)
        }
        return response
      }
      const response = await call(`/app/installations/${installationId}`, jwt)
      if (response.status === 404) return { installation: null, repositories: [] }
      if (!response.ok) throw new Error(`GitHub installation snapshot failed with status ${response.status}`)
      const installation = await response.json() as ObjectValue
      if (installation.id !== installationId || String(installation.app_id) !== appId ||
        !("suspended_at" in installation)) throw new Error("Invalid GitHub installation snapshot")
      if (installation.suspended_at) return { installation, repositories: [] }

      const minted = await call(`/app/installations/${installationId}/access_tokens`, jwt, { permissions: { metadata: "read" } })
      if (!minted.ok) throw new Error(`GitHub discovery token failed with status ${minted.status}`)
      const token = (await minted.json()).token
      if (typeof token !== "string" || !token) throw new Error("Invalid GitHub discovery token")
      const repositories: ObjectValue[] = []
      let expectedTotal: number | undefined
      // A bounded MVP discovery pass; no partial snapshot is ever committed.
      for (let page = 1; page <= 10; page++) {
        const listed = await call(`/installation/repositories?per_page=100&page=${page}`, token)
        if (!listed.ok) throw new Error(`GitHub repository snapshot failed with status ${listed.status}`)
        const data = await listed.json()
        if (!Array.isArray(data.repositories) || data.repositories.length > 100 ||
          !Number.isSafeInteger(data.total_count) || data.total_count < 0) throw new Error("Invalid GitHub repository snapshot")
        expectedTotal ??= data.total_count
        if (data.total_count !== expectedTotal) throw new Error("GitHub repository scope changed during snapshot; retry required")
        repositories.push(...data.repositories)
        if (repositories.length === expectedTotal) {
          if (new Set(repositories.map(repo => repo.id)).size !== repositories.length) throw new Error("Duplicate GitHub repository snapshot; retry required")
          return { installation, repositories }
        }
        if (data.repositories.length < 100 || repositories.length > expectedTotal!) throw new Error("Incomplete GitHub repository snapshot")
      }
      throw new Error("GitHub repository snapshot exceeds the 1000-repository MVP limit")
    },
  }
}
