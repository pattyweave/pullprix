import { describe, expect, it, vi } from "vitest"
import { createBackfillProcessor, type BackfillScope } from "./backfill.ts"
import { normalizeReviewContribution } from "./github-review.ts"

const user = { id: 7, login: "reviewer", type: "User", avatar_url: null }
const pr = { id: 101, number: 1, user, state: "closed", draft: false,
  title: "Example", html_url: "https://github.com/team/repo/pull/1",
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-24T00:00:00Z",
  closed_at: "2026-09-24T00:00:00Z", merged_at: "2026-09-24T00:00:00Z",
  requested_reviewers: [], body: "private PR body" }
const review = { id: 301, user, state: "APPROVED", body: "private review body",
  submitted_at: "2026-09-24T00:00:00Z", commit_id: "abc", author_association: "MEMBER",
  html_url: "https://github.com/team/repo/pull/1#pullrequestreview-301" }
const scope: BackfillScope = { repository_id: "repo", github_repository_id: 1001,
  github_installation_id: 12345, owner: "team", name: "repo", run_id: "run", version: 0,
  since_at: "2026-07-26T00:00:00Z", cursor: { phase: "pulls", pull_page: 1, page: 1,
    index: 0, pulls: [], has_more_pulls: false } }
const payload = { repository_id: "repo", run_id: "run", version: 0 }
function setup(items: Record<string, unknown>[], phase: "pulls" | "reviews" | "comments" = "pulls", hasNext = false) {
  const current = { ...scope, cursor: { ...scope.cursor, phase, pulls: phase === "pulls" ? [] : [pr] } }
  const repository = { get: vi.fn().mockResolvedValue(current), commit: vi.fn().mockResolvedValue(true) }
  const api = { readBackfillPage: vi.fn().mockResolvedValue({ items, hasNext }) }
  return { repository, api, current, process: createBackfillProcessor(repository, () => api) }
}

describe("repository backfill", () => {
  it("imports recent merged PRs, stops at the cutoff, and retains no bodies in the cursor", async () => {
    const s = setup([pr, { ...pr, id: 102, updated_at: "2026-07-25T00:00:00Z" }], "pulls", true)
    await s.process(payload)
    const [, items, next] = s.repository.commit.mock.calls[0]
    expect(items).toHaveLength(1)
    expect(items[0].fact).toMatchObject({ state: "closed", merged_at: pr.merged_at })
    expect(next).toMatchObject({ phase: "reviews", page: 1, has_more_pulls: false })
    expect(JSON.stringify([items, next])).not.toContain("private PR body")
    expect(next.pulls[0]).not.toHaveProperty("body")
  })

  it("uses the webhook review normalizer and skips pending reviews", async () => {
    const s = setup([review, { ...review, id: 302, state: "PENDING" }], "reviews")
    await s.process(payload)
    const expected = await normalizeReviewContribution({ id: "delivery", event_name: "pull_request_review",
      action: "submitted", github_installation_id: 12345,
      payload: { installation: { id: 12345 }, repository: { id: 1001 }, pull_request: pr, review } })
    const [, items, next] = s.repository.commit.mock.calls[0]
    expect(items).toEqual([{ kind: "review", fact: expected!.review, user, pull_id: 101 }])
    expect(next.phase).toBe("comments")
    expect(JSON.stringify(items)).not.toContain("private review body")
  })

  it("retains the actual dismissed snapshot without inventing an original outcome", async () => {
    const s = setup([{ ...review, state: "DISMISSED" }], "reviews")
    await s.process(payload)
    expect(s.repository.commit.mock.calls[0][1][0].fact.review_state).toBe("dismissed")
  })

  it("paginates reviews before moving to comments", async () => {
    const s = setup([review], "reviews", true)
    await s.process(payload)
    expect(s.repository.commit.mock.calls[0][2]).toMatchObject({ phase: "reviews", page: 2 })
  })

  it("normalizes inline comments and completes the last PR", async () => {
    const s = setup([{ id: 501, user, body: "comment", created_at: review.submitted_at,
      updated_at: review.submitted_at, html_url: "https://github.com/team/repo/pull/1#discussion_r501",
      author_association: "MEMBER", pull_request_review_id: 301 }], "comments")
    await expect(s.process(payload)).resolves.toMatchObject({ complete: true })
    expect(s.repository.commit.mock.calls[0][1][0]).toMatchObject({ kind: "comment",
      fact: { linked_review_github_id: 301, is_self_authored: true } })
    expect(s.repository.commit.mock.calls[0][2]).toBeNull()
  })

  it("moves through PRs then resumes the next list page", async () => {
    const s = setup([], "comments")
    s.current.cursor.pulls.push({ ...pr, id: 102, number: 2 })
    await s.process(payload)
    expect(s.repository.commit.mock.calls[0][2]).toMatchObject({ phase: "reviews", index: 1 })
    s.current.cursor.index = 1
    s.current.cursor.has_more_pulls = true
    await s.process(payload)
    expect(s.repository.commit.mock.calls[1][2]).toMatchObject({ phase: "pulls", page: 2, pull_page: 2, pulls: [] })
  })

  it("completes empty history and does not advance on API failure", async () => {
    const s = setup([])
    await expect(s.process(payload)).resolves.toMatchObject({ complete: true })
    s.repository.commit.mockClear()
    s.api.readBackfillPage.mockRejectedValue(new Error("API unavailable"))
    await expect(s.process(payload)).rejects.toThrow("API unavailable")
    expect(s.repository.commit).not.toHaveBeenCalled()
  })

  it("ignores stale or inactive work before making an API call", async () => {
    const s = setup([])
    s.repository.get.mockResolvedValue(null)
    await expect(s.process(payload)).resolves.toEqual({ disposition: "stale_or_inactive" })
    expect(s.api.readBackfillPage).not.toHaveBeenCalled()
    s.repository.get.mockResolvedValue(s.current)
    s.repository.commit.mockResolvedValue(false)
    await expect(s.process(payload)).resolves.toMatchObject({ disposition: "stale_or_inactive", complete: false })
  })
})
