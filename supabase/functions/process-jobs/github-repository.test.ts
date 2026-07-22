import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  isRepositoryAccessEvent,
  normalizeRepositoryChanges,
} from "./github-repository.ts"
import type { StoredGitHubDelivery } from "./github-installation.ts"

type Fixture = Omit<StoredGitHubDelivery, "github_installation_id" | "id"> & {
  name: string
}

const fixtures = JSON.parse(
  readFileSync(
    new URL("./fixtures/repository-access.json", import.meta.url),
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

describe("GitHub repository access normalization", () => {
  it.each(fixtures)("normalizes the $name fixture", (fixture) => {
    const storedDelivery = delivery(fixture)

    expect(isRepositoryAccessEvent(storedDelivery)).toBe(true)
    expect(normalizeRepositoryChanges(storedDelivery)).toMatchObject({
      githubInstallationId: 12345,
    })
  })

  it("activates added repositories and deactivates removed repositories", () => {
    const added = fixtures.find(({ name }) => name === "repositories added")!
    const removed = fixtures.find(({ name }) => name === "repositories removed")!

    expect(normalizeRepositoryChanges(delivery(added))?.repositories[0]?.active)
      .toBe(true)
    expect(normalizeRepositoryChanges(delivery(removed))?.repositories[0]?.active)
      .toBe(false)
  })

  it("updates a rename without changing access", () => {
    const renamed = fixtures.find(({ name }) => name === "repository renamed")!

    expect(normalizeRepositoryChanges(delivery(renamed))?.repositories[0])
      .toMatchObject({
        active: null,
        full_name: "pull-prix-sandbox/frontend",
        name: "frontend",
        owner: "pull-prix-sandbox",
      })
  })

  it("deactivates a transferred repository under its old installation", () => {
    const transferred = fixtures.find(({ name }) =>
      name === "repository transferred"
    )!

    expect(normalizeRepositoryChanges(delivery(transferred))?.repositories[0])
      .toMatchObject({ active: false, owner: "new-owner" })
  })

  it("records all-repository creations as active", () => {
    const created = fixtures.find(({ name }) =>
      name === "repository created for all access"
    )!

    expect(normalizeRepositoryChanges(delivery(created))?.repositories[0]?.active)
      .toBe(true)
  })

  it("rejects malformed repository identities", () => {
    expect(() => normalizeRepositoryChanges({
      action: "added",
      event_name: "installation_repositories",
      github_installation_id: 12345,
      id: "delivery-bad",
      payload: {
        installation: { id: 12345, updated_at: "2026-07-20T12:00:00Z" },
        repositories_added: [{ id: -1 }],
        repositories_removed: [],
        repository_selection: "selected",
      },
    })).toThrow("repository.full_name")
  })
})
