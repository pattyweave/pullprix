export type GitHubInstallationAuthScope = {
  github_installation_id: number
  repository_ids: number[]
  repository_selection: "all" | "selected"
}

export interface GitHubInstallationScopeRepository {
  get(githubInstallationId: number): Promise<GitHubInstallationAuthScope>
}

type Fetch = typeof fetch

export function createGitHubInstallationScopeRepository(
  supabaseUrl: string,
  secretKey: string,
  fetchImplementation: Fetch = fetch,
): GitHubInstallationScopeRepository {
  const headers: Record<string, string> = {
    apikey: secretKey,
    "content-type": "application/json",
  }
  if (secretKey.startsWith("eyJ")) {
    headers.authorization = `Bearer ${secretKey}`
  }

  return {
    async get(githubInstallationId) {
      const response = await fetchImplementation(
        `${supabaseUrl}/rest/v1/rpc/get_github_installation_auth_scope`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_github_installation_id: githubInstallationId,
          }),
        },
      )
      if (!response.ok) {
        throw new Error(`Installation auth scope lookup failed with status ${response.status}`)
      }

      const scopes = (await response.json()) as GitHubInstallationAuthScope[]
      const scope = scopes[0]
      if (!scope) throw new Error("Active GitHub installation not found")
      return scope
    },
  }
}
