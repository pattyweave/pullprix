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
  isActive: ReturnType<typeof vi.fn>
} {
  return {
    apply: vi.fn().mockResolvedValue({
      disposition: "applied",
      installation_id: "installation-1",
      installation_status: "active",
      organization_id: "organization-1",
    }),
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
