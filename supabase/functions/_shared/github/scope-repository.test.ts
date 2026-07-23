import { describe, expect, it, vi } from "vitest"

import { createGitHubInstallationScopeRepository } from "./scope-repository.ts"

describe("GitHub installation auth scope repository", () => {
  it("loads active repository scope with a legacy service-role JWT", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(Response.json([{
      github_installation_id: 12345,
      repository_ids: [1001],
      repository_selection: "selected",
    }])) as unknown as typeof fetch
    const repository = createGitHubInstallationScopeRepository(
      "https://project.supabase.co",
      "eyJ-service-role",
      fetchImplementation,
    )

    await expect(repository.get(12345)).resolves.toMatchObject({
      github_installation_id: 12345,
      repository_ids: [1001],
    })
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/get_github_installation_auth_scope",
      expect.objectContaining({
        body: JSON.stringify({ p_github_installation_id: 12345 }),
        headers: expect.objectContaining({
          apikey: "eyJ-service-role",
          authorization: "Bearer eyJ-service-role",
        }),
        method: "POST",
      }),
    )
  })

  it("uses hosted secret keys as API keys without copying them into Authorization", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(Response.json([{
      github_installation_id: 12345,
      repository_ids: [],
      repository_selection: "all",
    }])) as unknown as typeof fetch
    const repository = createGitHubInstallationScopeRepository(
      "https://project.supabase.co",
      "sb_secret_example",
      fetchImplementation,
    )

    await repository.get(12345)

    const options = fetchImplementation.mock.calls[0]?.[1] as RequestInit
    expect(options.headers).toEqual({
      apikey: "sb_secret_example",
      "content-type": "application/json",
    })
  })

  it("refuses missing or inactive installations", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      Response.json([]),
    ) as unknown as typeof fetch
    const repository = createGitHubInstallationScopeRepository(
      "https://project.supabase.co",
      "sb_secret_example",
      fetchImplementation,
    )

    await expect(repository.get(12345)).rejects.toThrow(
      "Active GitHub installation not found",
    )
  })
})
