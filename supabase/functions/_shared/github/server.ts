import { readGitHubApiEnvironment } from "../environment.ts"
import { createGitHubApiClient } from "./client.ts"
import { createGitHubInstallationScopeRepository } from "./scope-repository.ts"
import { createGitHubInstallationTokenProvider } from "./token-provider.ts"

type Environment = Record<string, string | undefined>
type Fetch = typeof fetch

export function createServerGitHubApiClient(
  variables: Environment,
  fetchImplementation: Fetch = fetch,
) {
  const environment = readGitHubApiEnvironment(variables)
  const scopes = createGitHubInstallationScopeRepository(
    environment.supabaseUrl,
    environment.supabaseSecretKey,
    fetchImplementation,
  )
  const tokens = createGitHubInstallationTokenProvider(
    environment.githubAppId,
    environment.githubPrivateKey,
    fetchImplementation,
  )
  return createGitHubApiClient(scopes, tokens, fetchImplementation)
}
