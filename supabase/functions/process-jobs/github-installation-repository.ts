import type {
  GitHubInstallationRepository,
  InstallationLifecycleChange,
  InstallationLifecycleResult,
  StoredGitHubDelivery,
} from "./github-installation.ts"

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
