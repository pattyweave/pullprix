import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"

import {
  createGitHubInstallationProcessor,
  normalizeInstallationLifecycle,
} from "./github-installation.ts"
import type {
  GitHubInstallationRepository,
  StoredGitHubDelivery,
} from "./github-installation.ts"

type Fixture = Omit<StoredGitHubDelivery, "github_installation_id" | "id"> & {
  name: string
}

const fixtures = JSON.parse(
  readFileSync(
    new URL("./fixtures/installation-lifecycle.json", import.meta.url),
    "utf8",
  ),
) as Fixture[]

function delivery(fixture: Fixture): StoredGitHubDelivery {
  return {
    action: fixture.action,
    event_name: fixture.event_name,
    github_installation_id: 12345,
    id: `delivery-${fixture.name}`,
    payload: fixture.payload,
  }
}

function repository(
  storedDelivery: StoredGitHubDelivery,
): GitHubInstallationRepository & {
  apply: ReturnType<typeof vi.fn>
  applyRepositories: ReturnType<typeof vi.fn>
  isActive: ReturnType<typeof vi.fn>
} {
  return {
    apply: vi.fn().mockResolvedValue({
      disposition: "applied",
      installation_id: "installation-1",
      installation_status: "active",
      organization_id: "organization-1",
    }),
    applyRepositories: vi.fn().mockResolvedValue(0),
    getDelivery: vi.fn().mockResolvedValue(storedDelivery),
    isActive: vi.fn().mockResolvedValue(true),
  }
}

describe("GitHub installation lifecycle processor", () => {
  it.each(fixtures)("normalizes the $name fixture", (fixture) => {
    const change = normalizeInstallationLifecycle(delivery(fixture))

    expect(change).toMatchObject({
      accountId: 9876,
      action: fixture.action,
      githubInstallationId: 12345,
      installedAt: "2026-07-20T12:00:00Z",
    })
  })

  it("uses the new top-level account identity for a rename", () => {
    const fixture = fixtures.find(({ name }) => name === "account renamed")!

    expect(normalizeInstallationLifecycle(delivery(fixture))).toMatchObject({
      accountLogin: "pull-prix-racing",
      action: "renamed",
    })
  })

  it("applies a normalized lifecycle change", async () => {
    const fixture = fixtures.find(({ name }) => name === "created")!
    const lifecycleRepository = repository(delivery(fixture))
    const processor = createGitHubInstallationProcessor(lifecycleRepository)

    await expect(processor("delivery-created")).resolves.toMatchObject({
      disposition: "applied",
      installation_status: "active",
    })
    expect(lifecycleRepository.apply).toHaveBeenCalledWith(
      expect.objectContaining({ action: "created", githubInstallationId: 12345 }),
    )
    expect(lifecycleRepository.applyRepositories).toHaveBeenCalledWith(
      expect.objectContaining({
        githubInstallationId: 12345,
        repositorySelection: "selected",
      }),
    )
  })

  it("applies repository access events for an active installation", async () => {
    const lifecycleRepository = repository({
      action: "added",
      event_name: "installation_repositories",
      github_installation_id: 12345,
      id: "delivery-repositories-added",
      payload: {
        installation: { id: 12345, updated_at: "2026-07-21T12:00:00Z" },
        repositories_added: [{
          id: 1002,
          name: "web",
          full_name: "pull-prix-sandbox/web",
          private: true,
        }],
        repositories_removed: [],
        repository_selection: "selected",
      },
    })
    lifecycleRepository.applyRepositories.mockResolvedValue(1)
    const processor = createGitHubInstallationProcessor(lifecycleRepository)

    await expect(processor("delivery-repositories-added")).resolves.toEqual({
      disposition: "applied",
      repositories_applied: 1,
    })
    expect(lifecycleRepository.isActive).toHaveBeenCalledWith(12345)
    expect(lifecycleRepository.applyRepositories).toHaveBeenCalledWith(
      expect.objectContaining({
        repositories: [expect.objectContaining({ active: true })],
      }),
    )
  })

  it("ignores non-lifecycle work after an installation stops", async () => {
    const lifecycleRepository = repository({
      action: "submitted",
      event_name: "pull_request_review",
      github_installation_id: 12345,
      id: "delivery-review",
      payload: { installation: { id: 12345 } },
    })
    lifecycleRepository.isActive.mockResolvedValue(false)
    const processor = createGitHubInstallationProcessor(lifecycleRepository)

    await expect(processor("delivery-review")).resolves.toEqual({
      disposition: "ignored",
      reason: "installation_inactive",
    })
    expect(lifecycleRepository.apply).not.toHaveBeenCalled()
    expect(lifecycleRepository.applyRepositories).not.toHaveBeenCalled()
  })

  it("leaves future active event types available for their own ticket", async () => {
    const lifecycleRepository = repository({
      action: "submitted",
      event_name: "pull_request_review",
      github_installation_id: 12345,
      id: "delivery-review",
      payload: { installation: { id: 12345 } },
    })
    const processor = createGitHubInstallationProcessor(lifecycleRepository)

    await expect(processor("delivery-review")).rejects.toThrow(
      "No installation lifecycle processor for pull_request_review.submitted",
    )
  })

  it("ignores repository actions unrelated to access or identity", async () => {
    const lifecycleRepository = repository({
      action: "archived",
      event_name: "repository",
      github_installation_id: 12345,
      id: "delivery-repository-archived",
      payload: { installation: { id: 12345 } },
    })
    const processor = createGitHubInstallationProcessor(lifecycleRepository)

    await expect(processor("delivery-repository-archived")).resolves.toEqual({
      disposition: "ignored",
      reason: "repository_action_not_relevant",
    })
  })

  it("rejects malformed lifecycle payloads", () => {
    expect(() => normalizeInstallationLifecycle({
      action: "created",
      event_name: "installation",
      github_installation_id: 12345,
      id: "delivery-bad",
      payload: {},
    })).toThrow("missing installation")
  })

  it("never hides a malformed lifecycle event behind inactive state", async () => {
    const lifecycleRepository = repository({
      action: "unsuspend",
      event_name: "installation",
      github_installation_id: 12345,
      id: "delivery-bad-unsuspend",
      payload: {},
    })
    lifecycleRepository.isActive.mockResolvedValue(false)
    const processor = createGitHubInstallationProcessor(lifecycleRepository)

    await expect(processor("delivery-bad-unsuspend")).rejects.toThrow(
      "missing installation",
    )
    expect(lifecycleRepository.isActive).not.toHaveBeenCalled()
  })
})
