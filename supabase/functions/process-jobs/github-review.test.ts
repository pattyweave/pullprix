import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  isReviewContributionEvent,
  normalizeReviewContribution,
} from "./github-review.ts"
import type { StoredGitHubDelivery } from "./github-installation.ts"

type Fixture = Omit<StoredGitHubDelivery, "github_installation_id" | "id"> & {
  name: string
}

const fixtures = JSON.parse(
  readFileSync(
    new URL("./fixtures/review-contributions.json", import.meta.url),
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

describe("GitHub formal review normalization", () => {
  it.each(fixtures)("normalizes the $name fixture", async (fixture) => {
    await expect(normalizeReviewContribution(delivery(fixture))).resolves
      .toMatchObject({
        githubInstallationId: 12345,
        githubPullRequestId: 9001,
        githubRepositoryId: 1001,
        review: {
          source_version: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      })
  })

  it("retains the three formal review states without calculating points", async () => {
    const changes = await Promise.all(
      fixtures.slice(0, 3).map((fixture) =>
        normalizeReviewContribution(delivery(fixture))
      ),
    )

    expect(changes.map((change) => change?.review.review_state)).toEqual([
      "approved",
      "changes_requested",
      "commented",
    ])
    expect(changes[0]?.review).not.toHaveProperty("points")
  })

  it("detects body presence without retaining the review body", async () => {
    const approval = await normalizeReviewContribution(delivery(fixtures[0]!))
    const changesRequested = await normalizeReviewContribution(
      delivery(fixtures[1]!),
    )

    expect(approval?.review.body_present).toBe(false)
    expect(changesRequested?.review.body_present).toBe(true)
    expect(changesRequested?.review).not.toHaveProperty("body")
  })

  it("gives duplicates a stable version and edits a new version", async () => {
    const submitted = await normalizeReviewContribution(delivery(fixtures[0]!))
    const duplicate = await normalizeReviewContribution(delivery(fixtures[0]!))
    const edited = await normalizeReviewContribution(delivery(fixtures[3]!))

    expect(duplicate?.review.source_version).toBe(
      submitted?.review.source_version,
    )
    expect(edited?.review.source_github_id).toBe(
      submitted?.review.source_github_id,
    )
    expect(edited?.review.source_version).not.toBe(
      submitted?.review.source_version,
    )
  })

  it("leaves dismissals for PP-032", async () => {
    const fixture = structuredClone(fixtures[0]!)
    fixture.action = "dismissed"

    expect(isReviewContributionEvent(delivery(fixture))).toBe(false)
    await expect(normalizeReviewContribution(delivery(fixture))).resolves.toBeNull()
  })

  it("rejects unsupported review states", async () => {
    const fixture = structuredClone(fixtures[0]!)
    const review = fixture.payload.review as Record<string, unknown>
    review.state = "pending"

    await expect(normalizeReviewContribution(delivery(fixture))).rejects.toThrow(
      "review.state",
    )
  })
})
