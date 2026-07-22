export type AcceptedGitHubDelivery = {
  delivery_id: string
  delivery_status: string
  duplicate: boolean
}

export type GitHubDelivery = {
  action: string | null
  eventName: string
  githubDeliveryId: string
  githubInstallationId: number | null
  payload: Record<string, unknown>
}

export interface GitHubDeliveryRepository {
  accept(delivery: GitHubDelivery): Promise<AcceptedGitHubDelivery>
}

type Fetch = typeof fetch

export function createGitHubDeliveryRepository(
  supabaseUrl: string,
  secretKey: string,
  fetchImplementation: Fetch = fetch,
): GitHubDeliveryRepository {
  return {
    async accept(delivery) {
      const headers: Record<string, string> = {
        apikey: secretKey,
        "content-type": "application/json",
      }

      if (secretKey.startsWith("eyJ")) {
        headers.authorization = `Bearer ${secretKey}`
      }

      const response = await fetchImplementation(
        `${supabaseUrl}/rest/v1/rpc/accept_github_delivery`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_action: delivery.action,
            p_event_name: delivery.eventName,
            p_github_delivery_id: delivery.githubDeliveryId,
            p_github_installation_id: delivery.githubInstallationId,
            p_payload: delivery.payload,
          }),
        },
      )

      if (!response.ok) {
        throw new Error(
          `Database RPC accept_github_delivery failed with status ${response.status}`,
        )
      }

      const rows = (await response.json()) as AcceptedGitHubDelivery[]
      const accepted = rows[0]
      if (!accepted) throw new Error("Database accepted no GitHub delivery")

      return accepted
    },
  }
}
