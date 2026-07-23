import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  isReviewCommentEvent,
  normalizeReviewComment,
} from "./github-review-comment.ts"
import type { StoredGitHubDelivery } from "./github-installation.ts"

type Fixture = Omit<StoredGitHubDelivery, "github_installation_id" | "id"> & {
  name: string
}

const fixtures = JSON.parse(
  readFileSync(
    new URL("./fixtures/review-comments.json", import.meta.url),
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

describe("GitHub review comment normalization", () => {
  it.each(fixtures)("normalizes the $name fixture", async (fixture) => {
    await expect(normalizeReviewComment(delivery(fixture))).resolves
      .toMatchObject({
        action: fixture.action,
        githubInstallationId: 12345,
        githubPullRequestId: 9001,
        githubRepositoryId: 1001,
        comment: {
          source_version: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      })
  })

  it("keeps only body presence, not text, length, or a quality score", async () => {
    const change = await normalizeReviewComment(delivery(fixtures[0]!))

    expect(change?.comment.body_present).toBe(true)
    expect(change?.comment).not.toHaveProperty("body")
    expect(change?.comment).not.toHaveProperty("body_length")
    expect(change?.comment).not.toHaveProperty("points")
    expect(change?.comment).not.toHaveProperty("quality")
  })

  it("associates the comment with a formal review when GitHub provides one", async () => {
    const linked = await normalizeReviewComment(delivery(fixtures[0]!))
    const unlinked = await normalizeReviewComment(delivery(fixtures[3]!))

    expect(linked?.comment.linked_review_github_id).toBe(5001)
    expect(unlinked?.comment.linked_review_github_id).toBeNull()
  })

  it("gives duplicates a stable version and edits a new version", async () => {
    const created = await normalizeReviewComment(delivery(fixtures[0]!))
    const duplicate = await normalizeReviewComment(delivery(fixtures[0]!))
    const edited = await normalizeReviewComment(delivery(fixtures[1]!))

    expect(duplicate?.comment.source_version).toBe(
      created?.comment.source_version,
    )
    expect(edited?.comment.source_github_id).toBe(
      created?.comment.source_github_id,
    )
    expect(edited?.comment.source_version).not.toBe(
      created?.comment.source_version,
    )
    expect(edited?.comment.body_present).toBe(false)
  })

  it("marks bot facts without discarding them", async () => {
    const change = await normalizeReviewComment(delivery(fixtures[3]!))

    expect(change?.comment).toMatchObject({
      actor_github_user_id: 7999,
      actor_type: "Bot",
      is_bot: true,
      is_self_authored: false,
    })
  })

  it("marks self-authored facts without treating them as score eligible", async () => {
    const change = await normalizeReviewComment(delivery(fixtures[4]!))

    expect(change?.comment).toMatchObject({
      actor_github_user_id: 7001,
      in_reply_to_github_id: 6001,
      is_bot: false,
      is_self_authored: true,
    })
  })

  it("rejects malformed actor identities", async () => {
    const fixture = structuredClone(fixtures[0]!)
    const comment = fixture.payload.comment as Record<string, unknown>
    comment.user = { id: -1, type: "User" }

    await expect(normalizeReviewComment(delivery(fixture))).rejects.toThrow(
      "comment.user.id",
    )
  })

  it("ignores unrelated event types", async () => {
    const fixture = structuredClone(fixtures[0]!)
    fixture.event_name = "issue_comment"

    expect(isReviewCommentEvent(delivery(fixture))).toBe(false)
    await expect(normalizeReviewComment(delivery(fixture))).resolves.toBeNull()
  })
})
