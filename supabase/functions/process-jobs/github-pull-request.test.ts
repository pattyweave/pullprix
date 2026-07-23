import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  isPullRequestLifecycleEvent,
  normalizePullRequestLifecycle,
} from "./github-pull-request.ts"
import type { StoredGitHubDelivery } from "./github-installation.ts"

type Fixture = Omit<StoredGitHubDelivery, "github_installation_id" | "id"> & {
  name: string
}

const fixtures = JSON.parse(
  readFileSync(
    new URL("./fixtures/pull-request-lifecycle.json", import.meta.url),
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

describe("GitHub pull request lifecycle normalization", () => {
  it.each(fixtures)("normalizes the $name fixture", (fixture) => {
    expect(normalizePullRequestLifecycle(delivery(fixture))).toMatchObject({
      action: fixture.action,
      githubInstallationId: 12345,
      githubRepositoryId: 1001,
      pullRequest: {
        author_github_user_id: 7001,
        github_pull_request_id: 9001,
        number: 42,
      },
    })
  })

  it("sorts and deduplicates requested reviewers", () => {
    const fixture = structuredClone(
      fixtures.find(({ name }) => name === "ready for review")!,
    )
    const pullRequest = fixture.payload.pull_request as Record<string, unknown>
    pullRequest.requested_reviewers = [
      { id: 7003 },
      { id: 7002 },
      { id: 7003 },
    ]

    expect(
      normalizePullRequestLifecycle(delivery(fixture))
        ?.pullRequest.requested_reviewer_github_ids,
    ).toEqual([7002, 7003])
  })

  it("leaves unrelated pull request actions for future tickets", () => {
    const fixture = structuredClone(fixtures[0]!)
    fixture.action = "labeled"

    expect(isPullRequestLifecycleEvent(delivery(fixture))).toBe(false)
    expect(normalizePullRequestLifecycle(delivery(fixture))).toBeNull()
  })

  it("rejects malformed author and reviewer identities", () => {
    const fixture = structuredClone(fixtures[0]!)
    const pullRequest = fixture.payload.pull_request as Record<string, unknown>
    pullRequest.user = { id: -1 }

    expect(() => normalizePullRequestLifecycle(delivery(fixture))).toThrow(
      "pull_request.user.id",
    )
  })
})
