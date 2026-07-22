import { describe, expect, it, vi } from "vitest"

import { createGitHubDeliveryRepository } from "./repository.ts"

const delivery = {
  action: "submitted",
  eventName: "pull_request_review",
  githubDeliveryId: "72d3162e-cc78-11e3-81ab-4c9367dc0958",
  githubInstallationId: 12345,
  payload: { action: "submitted" },
}

describe("GitHub delivery RPC repository", () => {
  it("persists the verified delivery with a legacy service-role JWT", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      Response.json([{
        delivery_id: "10000000-0000-0000-0000-000000000001",
        delivery_status: "queued",
        duplicate: false,
      }]),
    ) as unknown as typeof fetch
    const repository = createGitHubDeliveryRepository(
      "http://localhost:54321",
      "eyJlegacy-service-role",
      fetchImplementation,
    )

    await expect(repository.accept(delivery)).resolves.toMatchObject({
      duplicate: false,
    })
    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://localhost:54321/rest/v1/rpc/accept_github_delivery",
      expect.objectContaining({
        headers: {
          apikey: "eyJlegacy-service-role",
          authorization: "Bearer eyJlegacy-service-role",
          "content-type": "application/json",
        },
      }),
    )
  })

  it("keeps a hosted secret key out of the Authorization header", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      Response.json([{
        delivery_id: "10000000-0000-0000-0000-000000000001",
        delivery_status: "queued",
        duplicate: true,
      }]),
    ) as unknown as typeof fetch
    const repository = createGitHubDeliveryRepository(
      "https://example.supabase.co",
      "sb_secret_hosted",
      fetchImplementation,
    )

    await repository.accept(delivery)

    const options = fetchImplementation.mock.calls[0]?.[1] as RequestInit
    expect(options.headers).toEqual({
      apikey: "sb_secret_hosted",
      "content-type": "application/json",
    })
  })

  it("fails closed when persistence does not return a delivery", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      Response.json([]),
    ) as unknown as typeof fetch
    const repository = createGitHubDeliveryRepository(
      "http://localhost:54321",
      "eyJlegacy-service-role",
      fetchImplementation,
    )

    await expect(repository.accept(delivery)).rejects.toThrow(
      "Database accepted no GitHub delivery",
    )
  })
})
