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

  it("applies a canonical review contribution through one RPC", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(Response.json([{
      contribution_id: "contribution-1",
      disposition: "inserted",
    }])) as unknown as typeof fetch
    const repository = createGitHubInstallationRepository(
      "https://example.supabase.co",
      "sb_secret_hosted",
      fetchImplementation,
    )
    const review = {
      actor_github_user_id: 7002,
      author_association: "COLLABORATOR",
      body_present: false,
      commit_id: "1111111111111111111111111111111111111111",
      html_url: "https://github.com/example/repo/pull/42#pullrequestreview-5001",
      occurred_at: "2026-07-20T14:00:00Z",
      review_state: "approved" as const,
      source_github_id: 5001,
      source_version: "a".repeat(64),
    }

    await expect(repository.applyReviewContribution({
      githubInstallationId: 12345,
      githubPullRequestId: 9001,
      githubRepositoryId: 1001,
      review,
    })).resolves.toEqual({
      contribution_id: "contribution-1",
      disposition: "inserted",
    })
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/rpc/apply_github_review_contribution",
      expect.objectContaining({
        body: JSON.stringify({
          p_github_installation_id: 12345,
          p_github_pull_request_id: 9001,
          p_github_repository_id: 1001,
          p_review: review,
        }),
        method: "POST",
      }),
    )
  })

  it("applies a review dismissal and returns its scoring marker", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(Response.json([{
      contribution_id: "contribution-1",
      disposition: "dismissed",
      scoring_recalculation_requested_at: "2026-07-20T17:00:00Z",
    }])) as unknown as typeof fetch
    const repository = createGitHubInstallationRepository(
      "https://example.supabase.co",
      "sb_secret_hosted",
      fetchImplementation,
    )
    const dismissal = {
      dismissed_at: "2026-07-20T17:00:00Z",
      dismissed_by_github_user_id: 7010,
      reviewer_github_user_id: 7002,
      source_github_id: 5001,
      source_version: "a".repeat(64),
    }

    await expect(repository.applyReviewDismissal({
      dismissal,
      githubInstallationId: 12345,
      githubPullRequestId: 9001,
      githubRepositoryId: 1001,
    })).resolves.toEqual({
      contribution_id: "contribution-1",
      disposition: "dismissed",
      scoring_recalculation_requested_at: "2026-07-20T17:00:00Z",
    })
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/rpc/dismiss_github_review_contribution",
      expect.objectContaining({
        body: JSON.stringify({
          p_dismissal: dismissal,
          p_github_installation_id: 12345,
          p_github_pull_request_id: 9001,
          p_github_repository_id: 1001,
        }),
        method: "POST",
      }),
    )
  })

  it("applies a canonical review comment through one RPC", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(Response.json([{
      contribution_id: "comment-contribution-1",
      disposition: "inserted",
      scoring_recalculation_requested_at: "2026-07-20T14:00:00Z",
    }])) as unknown as typeof fetch
    const repository = createGitHubInstallationRepository(
      "https://example.supabase.co",
      "sb_secret_hosted",
      fetchImplementation,
    )
    const comment = {
      actor_github_user_id: 7002,
      actor_type: "User",
      author_association: "MEMBER",
      body_present: true,
      created_at: "2026-07-20T14:00:00Z",
      html_url: "https://github.com/example/repo/pull/42#discussion_r6001",
      in_reply_to_github_id: null,
      is_bot: false,
      is_self_authored: false,
      linked_review_github_id: 5001,
      source_github_id: 6001,
      source_version: "a".repeat(64),
      updated_at: "2026-07-20T14:00:00Z",
    }

    await expect(repository.applyReviewComment({
      action: "created",
      comment,
      githubInstallationId: 12345,
      githubPullRequestId: 9001,
      githubRepositoryId: 1001,
    })).resolves.toEqual({
      contribution_id: "comment-contribution-1",
      disposition: "inserted",
      scoring_recalculation_requested_at: "2026-07-20T14:00:00Z",
    })
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/rpc/apply_github_review_comment",
      expect.objectContaining({
        body: JSON.stringify({
          p_action: "created",
          p_comment: comment,
          p_github_installation_id: 12345,
          p_github_pull_request_id: 9001,
          p_github_repository_id: 1001,
        }),
        method: "POST",
      }),
    )
  })
})
