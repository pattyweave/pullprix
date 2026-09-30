import { describe, expect, it, vi } from "vitest"
import { createScoringProcessor, createScoringRepository, recomputeScores, seasonAt, type ScoringBundle } from "./scoring.ts"

function bundle(): ScoringBundle {
  return { revision: 1, eligibleFrom: "2026-09-01T00:00:00Z", components: [], input: {
    policyVersion: "v1", organizationId: "org",
    pullRequest: { id: "pr", repositoryId: "repo", number: 1, url: "https://github.com/team/repo/pull/1", authorGithubUserId: 1, authorEligible: true },
    participants: [{ id: "actor", githubUserId: 2, eligible: true, scoringFrom: "2026-09-01T00:00:00Z", leftAt: null }],
    repositoryAccess: [{ from: "2026-09-01T00:00:00Z", until: null }], comments: [], headChanges: [],
    reviewHistoryComplete: true, headHistoryComplete: true,
    reviews: [{ id: "review", githubReviewId: 1, actorGithubUserId: 2, occurredAt: "2026-09-10T13:00:00Z", outcome: "approved",
      bodyPresent: false, effective: true, commitId: "a", url: "https://github.com/team/repo/pull/1#review-1",
      readiness: { state: "ready", since: "2026-09-10T12:00:00Z" }, creditBeforeReview: "unconfigured", feedbackComplete: true }],
  } }
}
function awarded() { const b = bundle(); b.components = recomputeScores(b).components; return b }
const total = (b: ScoringBundle) => recomputeScores(b).components.reduce((sum, c) => sum + c.points, 0)

describe("PP-041 score recomputation", () => {
  it.each([
    ["2026-09-07T11:59:59Z", "2026-08", "2026-08-03T12:00:00.000Z", "2026-09-07T12:00:00.000Z"],
    ["2026-09-07T12:00:00Z", "2026-09", "2026-09-07T12:00:00.000Z", "2026-10-05T12:00:00.000Z"],
    ["2027-01-01T00:00:00Z", "2026-12", "2026-12-07T12:00:00.000Z", "2027-01-04T12:00:00.000Z"],
  ])("uses global first-Monday noon boundaries for %s", (at, id, startsAt, endsAt) => {
    expect(seasonAt(at)).toEqual({ id, startsAt, endsAt })
  })
  it("is idempotent and leaves canonical input untouched", () => {
    const b = awarded(), copy = structuredClone(b)
    expect(recomputeScores(b).components).toEqual(b.components)
    expect(recomputeScores(b)).toEqual(recomputeScores(b))
    expect(b).toEqual(copy)
  })
  it.each(["deletion", "reviewer exclusion", "author exclusion", "self review"])("reverses a known %s even with incomplete history", reason => {
    const b = awarded(); b.input.reviewHistoryComplete = false
    if (reason === "deletion") b.input.reviews[0].effective = false
    if (reason === "reviewer exclusion") b.input.participants[0].eligible = false
    if (reason === "author exclusion") b.input.pullRequest.authorEligible = false
    if (reason === "self review") b.input.pullRequest.authorGithubUserId = 2
    expect(total(b)).toBe(0)
    expect(b.components[0].points).toBe(8)
  })
  it("retains a dismissed approval even while unrelated context is pending", () => {
    const b=awarded(); b.input.reviews[0].effective=false; b.input.reviews[0].approvalDismissed=true
    b.input.reviewHistoryComplete=false
    expect(total(b)).toBe(8)
    expect(recomputeScores(b).retainedComponentIds).toEqual([b.components[0].id])
  })
  it("retains earned points when context is missing, without creating new points", () => {
    const b = awarded(); b.input.reviews[0].creditBeforeReview = "unknown"
    expect(recomputeScores(b)).toMatchObject({ status: "pending", retainedComponentIds: [b.components[0].id] })
    expect(total(b)).toBe(8)
    b.components = []; expect(total(b)).toBe(0)
  })
  it("adjusts deleted feedback even with unrelated missing gate context", () => {
    const b = bundle(); b.input.reviews[0].bodyPresent = true
    b.components = recomputeScores(b).components
    b.input.reviews[0].bodyPresent = false; b.input.reviews[0].creditBeforeReview = "unknown"
    expect(total(b)).toBe(8)
    b.components[0].kind = "comment_review_with_feedback"; b.input.reviews[0].outcome = "commented"
    expect(total(b)).toBe(0)
  })
  it("corrects a base in place rather than appending another award", () => {
    const b = awarded(); b.input.reviews[0].bodyPresent = true
    const result = recomputeScores(b)
    expect(result.components).toHaveLength(1)
    expect(result.components[0]).toMatchObject({ id: b.components[0].id, points: 10 })
  })
  it("recomputes old and new seasons without resetting PR lifetime caps", () => {
    const b = awarded()
    b.input.reviews = [...b.input.reviews, { ...b.input.reviews[0], id: "return", githubReviewId: 2, commitId: "b", occurredAt: "2026-10-06T13:00:00Z" }]
    b.input.headChanges = [{ occurredAt: "2026-10-06T12:00:00Z", commitId: "b" }]
    expect(recomputeScores(b).components.map(c => [c.kind, c.seasonId, c.points])).toEqual([
      ["approval", "2026-09", 8], ["follow_through", "2026-10", 4],
    ])
    b.eligibleFrom = "2026-10-01T00:00:00Z"; b.components = []
    expect(total(b)).toBe(4)
  })
  it("historical repository removal preserves work earned before removal", () => {
    const b = awarded(); b.input.repositoryAccess[0].until = "2026-09-11T00:00:00Z"
    expect(total(b)).toBe(8)
  })
})

describe("scoring worker", () => {
  const id = "11111111-1111-1111-1111-111111111111"
  it("reports stale CAS without claiming an award was persisted", async () => {
    const repository = { get: vi.fn().mockResolvedValue(bundle()), commit: vi.fn().mockResolvedValue(false), enqueue: vi.fn() }
    expect(await createScoringProcessor(repository)({ pull_request_id: id })).toMatchObject({ disposition: "stale" })
  })
  it("rejects bad jobs before database access", async () => {
    const repository = { get: vi.fn(), commit: vi.fn(), enqueue: vi.fn() }
    await expect(createScoringProcessor(repository)({ pull_request_id: "oops" })).rejects.toThrow("Invalid scoring job")
    expect(repository.get).not.toHaveBeenCalled()
  })
  it("applies known reversals before a failing API request", async () => {
    const b = awarded(); b.input.reviews[0].effective = false
    b.scope = { active: true, githubInstallationId: 1, githubRepositoryId: 2, githubPullRequestId: 3, owner: "team", name: "repo", number: 1 }
    const repository = { get: vi.fn().mockResolvedValue(b), commit: vi.fn().mockResolvedValue(true), enqueue: vi.fn(), enrich: vi.fn() }
    const api = { readBackfillPage: vi.fn().mockRejectedValue(new Error("unavailable")), readReviewGate: vi.fn() }
    await expect(createScoringProcessor(repository, () => api)({ pull_request_id: id })).rejects.toThrow("unavailable")
    expect(repository.commit.mock.calls[0][2].components).toEqual([])
  })
  it("uses service RPCs without leaking the secret into errors", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ error: "secret" }, { status: 403 }))
    const repository = createScoringRepository("https://db.test", "sb_secret_test", request)
    await expect(repository.get(id)).rejects.toThrow("Scoring RPC get_pull_request_scoring_input failed with status 403")
    expect(request.mock.calls[0][1].headers.authorization).toBeUndefined()
  })
  it("leaves a concurrently changed revision dirty when enrichment CAS loses", async () => {
    const b = bundle()
    b.scope = { active: true, githubInstallationId: 1, githubRepositoryId: 2, githubPullRequestId: 3, owner: "team", name: "repo", number: 1 }
    const repository = { get: vi.fn().mockResolvedValue(b), commit: vi.fn().mockResolvedValue(true), enqueue: vi.fn(), enrich: vi.fn().mockResolvedValue(false) }
    const api = { readBackfillPage: vi.fn().mockResolvedValue({ items: [], hasNext: false, rateLimit: {} }), readReviewGate: vi.fn().mockResolvedValue(null) }
    expect(await createScoringProcessor(repository, () => api)({ pull_request_id: id })).toEqual({ disposition: "stale" })
    expect(repository.get).toHaveBeenCalledTimes(1)
    expect(repository.commit).toHaveBeenCalledTimes(1) // only the pre-fetch, old revision
  })
})
