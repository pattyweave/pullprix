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
  function gateResponse(reviewDecision: string | null = null, baseRef: unknown = { branchProtectionRule: null }) {
    return { data: { repository: { pullRequest: { headRefOid: "head", baseRefName: "release/main", reviewDecision,
      baseRef, reviews: { nodes: [{ databaseId: 42 }] } } } } }
  }
  it("verifies both classic protection and active rules before fallback", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json(gateResponse())).mockResolvedValueOnce(Response.json([]))
    const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request, "https://github.test")
    expect(await client.readReviewGate(12345, 1001, "team", "repo", 1)).toEqual({ headSha: "head", latestReviewGithubId: 42, credit: "unconfigured" })
    expect(request.mock.calls[1][0]).toBe("https://github.test/repos/team/repo/rules/branches/release%2Fmain?per_page=100")
  })
  it("a missing rules permission is unknown, not unconfigured", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json(gateResponse())).mockResolvedValueOnce(new Response(null, { status: 403 }))
    const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request)
    expect(await client.readReviewGate(12345, 1001, "team", "repo", 1)).toMatchObject({ credit: "unknown" })
  })
  const planMessage = "Upgrade to GitHub Pro or make this repository public to enable this feature."
  it("uses fallback for explicitly unavailable free-plan rules after verifying no classic review requirement", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json(gateResponse()))
      .mockResolvedValueOnce(Response.json({ message: planMessage }, { status: 403 }))
    const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request)
    expect(await client.readReviewGate(12345, 1001, "team", "repo", 1)).toMatchObject({ credit: "unconfigured" })
  })
  it("a free-plan rules response does not hide unknown classic protection", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json(gateResponse(null, null)))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ message: planMessage }, { status: 403 }))
    const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request)
    expect(await client.readReviewGate(12345, 1001, "team", "repo", 1)).toMatchObject({ credit: "unknown" })
  })
  it("an ordinary rules permission denial remains unknown", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json(gateResponse()))
      .mockResolvedValueOnce(Response.json({ message: "Resource not accessible by integration" }, { status: 403 }))
    const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request)
    expect(await client.readReviewGate(12345, 1001, "team", "repo", 1)).toMatchObject({ credit: "unknown" })
  })
  it("rate limiting takes precedence over a feature-unavailable response", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json(gateResponse()))
      .mockResolvedValueOnce(Response.json({ message: planMessage }, { status: 403, headers: rateHeaders(0) }))
    const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request)
    await expect(client.readReviewGate(12345, 1001, "team", "repo", 1)).rejects.toBeInstanceOf(GitHubRateLimitError)
  })
  it("uses read-only branch metadata if GraphQL classic protection is inaccessible", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ ...gateResponse(null, null), errors: [{ type: "FORBIDDEN" }] }))
      .mockResolvedValueOnce(Response.json({ protected: false })).mockResolvedValueOnce(Response.json([]))
    const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request)
    expect(await client.readReviewGate(12345, 1001, "team", "repo", 1)).toMatchObject({ credit: "unconfigured" })
  })
  it("unknown protection is never treated as disabled even when rulesets are empty", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json(gateResponse(null, null)))
      .mockResolvedValueOnce(new Response(null, { status: 403 })).mockResolvedValueOnce(Response.json([]))
    const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request)
    expect(await client.readReviewGate(12345, 1001, "team", "repo", 1)).toMatchObject({ credit: "unknown" })
  })
  it("a permission-denied null protection field is not proof of no classic rules", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ ...gateResponse(), errors: [{ path: ["repository", "pullRequest", "baseRef", "branchProtectionRule"] }] }))
      .mockResolvedValueOnce(Response.json({ protected: true })).mockResolvedValueOnce(Response.json([]))
    const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request)
    expect(await client.readReviewGate(12345, 1001, "team", "repo", 1)).toMatchObject({ credit: "unknown" })
  })
  it("does not infer unconfigured from a potentially truncated rules page", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json(gateResponse()))
      .mockResolvedValueOnce(Response.json(Array.from({ length: 100 }, () => ({ type: "creation" }))))
    const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request)
    expect(await client.readReviewGate(12345, 1001, "team", "repo", 1)).toMatchObject({ credit: "unknown" })
  })
  it.each([["APPROVED", "satisfied"], ["CHANGES_REQUESTED", "required"], ["REVIEW_REQUIRED", "required"]])(
    "uses GitHub %s without requiring access to unrelated branch fields", async (state, credit) => {
      const request = vi.fn().mockResolvedValueOnce(Response.json({ ...gateResponse(state, null), errors: [{ type: "FORBIDDEN" }] }))
      const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request)
      expect(await client.readReviewGate(12345, 1001, "team", "repo", 1)).toMatchObject({ credit })
      expect(request).toHaveBeenCalledTimes(1)
    })
  it("does not mistake a rule-configured branch with unknown reviewDecision for fallback", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json(gateResponse())).mockResolvedValueOnce(Response.json([{ type: "pull_request" }]))
    const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request)
    expect(await client.readReviewGate(12345, 1001, "team", "repo", 1)).toMatchObject({ credit: "unknown" })
  })
  it("refuses review gate lookup outside the installation's selected repositories", async () => {
    const request = vi.fn(), client = createGitHubApiClient(scopeRepository(), tokenProvider(), request)
    await expect(client.readReviewGate(12345, 999, "team", "repo", 1)).rejects.toThrow("not active")
    expect(request).not.toHaveBeenCalled()
  })
  it("reads one authorized backfill page without following arbitrary Link URLs", async () => {
    const request = vi.fn().mockResolvedValue(Response.json([{ id: 1 }], {
      headers: { link: '<https://evil.example/steal>; rel="next"' },
    }))
    const client = createGitHubApiClient(scopeRepository(), tokenProvider(), request, "https://github.test")
    await expect(client.readBackfillPage(12345, 1001, "team", "repo", "pulls", 2))
      .resolves.toMatchObject({ items: [{ id: 1 }], hasNext: true })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0]).toBe("https://github.test/repos/team/repo/pulls?per_page=20&page=2&state=all&sort=updated&direction=desc")
    await expect(client.readBackfillPage(12345, 9999, "team", "repo", "reviews", 1, 1)).rejects.toThrow()
    await expect(client.readBackfillPage(12345, 1001, "../bad", "repo", "pulls", 1)).rejects.toThrow()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it("refreshes unauthorized tokens and exposes safe backfill rate-limit errors", async () => {
    const tokens = tokenProvider()
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response("sensitive", { status: 403, headers: rateHeaders(0, 90) }))
    const client = createGitHubApiClient(scopeRepository(), tokens, request, "https://github.test")
    await expect(client.readBackfillPage(12345, 1001, "team", "repo", "comments", 1, 4))
      .rejects.toMatchObject({ message: "GitHub API rate limit exceeded", rateLimit: { retryAfterSeconds: 90 } })
    expect(tokens.invalidate).toHaveBeenCalledWith(12345)
    expect(request.mock.calls[1][0]).toBe("https://github.test/repos/team/repo/pulls/4/comments?per_page=20&page=1")
  })
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
