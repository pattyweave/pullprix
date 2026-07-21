import { describe, expect, it, vi } from "vitest"

import { createBackgroundJobRepository } from "./repository.ts"

describe("background job RPC repository", () => {
  it("adds Authorization only for a legacy service-role JWT", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      Response.json([]),
    ) as unknown as typeof fetch
    const repository = createBackgroundJobRepository(
      "http://localhost:54321",
      "eyJlegacy-service-role",
      fetchImplementation,
    )

    await repository.claim(5, 60)

    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://localhost:54321/rest/v1/rpc/claim_background_jobs",
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: "eyJlegacy-service-role",
          authorization: "Bearer eyJlegacy-service-role",
        }),
      }),
    )
  })

  it("keeps new secret keys out of the Authorization header", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      Response.json([]),
    ) as unknown as typeof fetch
    const repository = createBackgroundJobRepository(
      "https://example.supabase.co",
      "sb_secret_hosted",
      fetchImplementation,
    )

    await repository.claim(5, 60)

    const options = fetchImplementation.mock.calls[0]?.[1] as RequestInit
    expect(options.headers).toEqual({
      apikey: "sb_secret_hosted",
      "content-type": "application/json",
    })
  })
})
