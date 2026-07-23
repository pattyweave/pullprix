import { describe, expect, it, vi } from "vitest"

import { createGitHubInstallationRepository } from "./github-installation-repository.ts"

describe("GitHub installation repository", () => {
  it("loads a delivery and applies its lifecycle change", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(Response.json([{
        action: "created",
        event_name: "installation",
        github_installation_id: 12345,
        id: "delivery-1",
        payload: {},
      }]))
      .mockResolvedValueOnce(Response.json([{
        disposition: "applied",
        installation_id: "installation-1",
        installation_status: "active",
        organization_id: "organization-1",
      }])) as unknown as typeof fetch
    const repository = createGitHubInstallationRepository(
      "http://localhost:54321",
      "eyJlegacy-service-role",
      fetchImplementation,
    )

    await repository.getDelivery("delivery-1")
    await repository.apply({
      accountId: 9876,
      accountLogin: "pull-prix-sandbox",
      accountType: "Organization",
      action: "created",
      githubInstallationId: 12345,
      githubUpdatedAt: "2026-07-20T12:00:00Z",
      installedAt: "2026-07-20T12:00:00Z",
      suspendedAt: null,
    })

    expect(fetchImplementation.mock.calls[0]?.[0]).toContain(
      "/rpc/get_github_delivery_for_processing",
    )
    expect(fetchImplementation.mock.calls[1]?.[0]).toContain(
      "/rpc/apply_github_installation_lifecycle",
    )
    expect(fetchImplementation.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        authorization: "Bearer eyJlegacy-service-role",
      }),
    })
  })

  it("checks installation activity without using Authorization for hosted keys", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      Response.json(false),
    ) as unknown as typeof fetch
    const repository = createGitHubInstallationRepository(
      "https://example.supabase.co",
      "sb_secret_hosted",
      fetchImplementation,
    )

    await expect(repository.isActive(12345)).resolves.toBe(false)
    const options = fetchImplementation.mock.calls[0]?.[1] as RequestInit
    expect(options.headers).toEqual({
      apikey: "sb_secret_hosted",
      "content-type": "application/json",
    })
  })

  it("applies normalized repository changes through one RPC", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      Response.json(1),
    ) as unknown as typeof fetch
    const repository = createGitHubInstallationRepository(
      "https://example.supabase.co",
      "sb_secret_hosted",
      fetchImplementation,
    )

    await expect(repository.applyRepositories({
      eventAt: "2026-07-21T12:00:00Z",
      githubInstallationId: 12345,
      repositories: [{
        active: true,
        full_name: "pull-prix-sandbox/web",
        github_repository_id: 1002,
        name: "web",
        owner: "pull-prix-sandbox",
        private: true,
      }],
      repositorySelection: "selected",
    })).resolves.toBe(1)

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/rpc/apply_github_repository_changes",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("applies a normalized pull request snapshot through one RPC", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(Response.json([{
      disposition: "inserted",
      pull_request_id: "pull-request-1",
    }])) as unknown as typeof fetch
    const repository = createGitHubInstallationRepository(
      "https://example.supabase.co",
      "sb_secret_hosted",
      fetchImplementation,
    )
    const pullRequest = {
      author_github_user_id: 7001,
      closed_at: null,
      created_at: "2026-07-20T12:00:00Z",
      draft: true,
      github_pull_request_id: 9001,
      html_url: "https://github.com/pull-prix-sandbox/api/pull/42",
      merged_at: null,
      number: 42,
      requested_reviewer_github_ids: [],
      state: "open" as const,
      title: "Add telemetry",
      updated_at: "2026-07-20T12:00:00Z",
    }

    await expect(repository.applyPullRequest({
      action: "opened",
      githubInstallationId: 12345,
      githubRepositoryId: 1001,
      pullRequest,
    })).resolves.toEqual({
      disposition: "inserted",
      pull_request_id: "pull-request-1",
    })
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/rpc/apply_github_pull_request_lifecycle",
      expect.objectContaining({
        body: JSON.stringify({
          p_action: "opened",
          p_github_installation_id: 12345,
          p_github_repository_id: 1001,
          p_pull_request: pullRequest,
        }),
        method: "POST",
      }),
    )
  })
})
