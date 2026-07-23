import { describe, expect, it, vi } from "vitest"

import { createGitHubApiClient } from "./client.ts"
import { GitHubRateLimitError } from "./rate-limit.ts"
import type { GitHubInstallationScopeRepository } from "./scope-repository.ts"
import type { GitHubInstallationTokenProvider } from "./token-provider.ts"

const scope = {
  github_installation_id: 12345,
  repository_ids: [1001],
  repository_selection: "selected" as const,
}

function scopeRepository(): GitHubInstallationScopeRepository {
  return { get: vi.fn().mockResolvedValue(scope) }
}

function tokenProvider(): GitHubInstallationTokenProvider {
  return {
    get: vi.fn().mockResolvedValue("opaque-installation-token"),
    invalidate: vi.fn(),
  }
}

function rateHeaders(remaining: number, retryAfter?: number) {
  const headers: Record<string, string> = {
    "x-ratelimit-limit": "5000",
    "x-ratelimit-remaining": String(remaining),
    "x-ratelimit-reset": "1784811600",
    "x-ratelimit-resource": "core",
    "x-ratelimit-used": String(5000 - remaining),
  }
  if (retryAfter !== undefined) headers["retry-after"] = String(retryAfter)
  return headers
}

describe("GitHub API client", () => {
  it("lists every authorized repository and returns the latest rate-limit metadata", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }))
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(Response.json(
        { repositories: firstPage, total_count: 101 },
        { headers: rateHeaders(4999) },
      ))
      .mockResolvedValueOnce(Response.json(
        { repositories: [{ id: 101 }], total_count: 101 },
        { headers: rateHeaders(4998) },
      )) as unknown as typeof fetch
    const client = createGitHubApiClient(
      scopeRepository(),
      tokenProvider(),
      fetchImplementation,
      "https://github.test",
    )

    const result = await client.listInstallationRepositories(12345)

    expect(result.repositories).toHaveLength(101)
    expect(result.rateLimit).toMatchObject({
      limit: 5000,
      remaining: 4998,
      resource: "core",
      used: 2,
    })
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      "https://github.test/installation/repositories?per_page=100&page=2",
      expect.any(Object),
    )
  })

  it("invalidates and retries once when GitHub rejects an expired token", async () => {
    const tokens = tokenProvider()
    vi.mocked(tokens.get)
      .mockResolvedValueOnce("expired-token")
      .mockResolvedValueOnce("fresh-token")
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json(
        { repositories: [{ id: 1001 }], total_count: 1 },
        { headers: rateHeaders(4999) },
      )) as unknown as typeof fetch
    const client = createGitHubApiClient(
      scopeRepository(),
      tokens,
      fetchImplementation,
      "https://github.test",
    )

    await expect(client.listInstallationRepositories(12345)).resolves.toMatchObject({
      repositories: [{ id: 1001 }],
    })
    expect(tokens.invalidate).toHaveBeenCalledWith(12345)
    expect(tokens.get).toHaveBeenCalledTimes(2)
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer fresh-token" }),
      }),
    )
  })

  it("makes rate-limit retry data available without leaking GitHub's response body", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response("internal details", {
        status: 429,
        headers: rateHeaders(0, 30),
      }),
    ) as unknown as typeof fetch
    const client = createGitHubApiClient(
      scopeRepository(),
      tokenProvider(),
      fetchImplementation,
      "https://github.test",
    )

    const error = await client.listInstallationRepositories(12345)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(GitHubRateLimitError)
    expect(error).toMatchObject({
      message: "GitHub API rate limit exceeded",
      rateLimit: {
        limit: 5000,
        remaining: 0,
        retryAfterSeconds: 30,
      },
    })
    expect(String(error)).not.toContain("internal details")
  })
})
