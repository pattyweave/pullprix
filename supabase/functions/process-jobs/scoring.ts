import { scorePullRequestV1 } from "../_shared/scoring/v1.ts"
import type { ReviewFact, ScoreComponent, ScoreDecision, ScoringInput } from "../_shared/scoring/v1.ts"
import type { createGitHubApiClient } from "../_shared/github/client.ts"
import { normalizeReviewContribution } from "./github-review.ts"
import { normalizeReviewComment } from "./github-review-comment.ts"
import type { StoredGitHubDelivery } from "./github-installation.ts"

export type ScoringBundle = {
  revision: number
  input: Omit<ScoringInput, "season">
  eligibleFrom: string
  components: ScoreComponent[]
  scope?: { active: boolean; githubInstallationId: number; githubRepositoryId: number; githubPullRequestId: number;
    owner: string; name: string; number: number }
}
export type ScoringCommit = {
  status: "complete" | "pending"
  components: ScoreComponent[]
  decisions: (ScoreDecision & { seasonId: string })[]
  retainedComponentIds: string[]
}
export interface ScoringRepository {
  enqueue(): Promise<number>
  get(pullRequestId: string): Promise<ScoringBundle | null>
  commit(pullRequestId: string, revision: number, result: ScoringCommit): Promise<boolean>
  enrich?(pullRequestId: string, revision: number, items: unknown[], observedAt: string, gate: unknown): Promise<boolean>
}

import { seasonAt } from "../_shared/scoring/season.ts"
export { seasonAt } from "../_shared/scoring/season.ts"

/** Full PR recomputation, projected into every affected season, not just today. */
export function recomputeScores(bundle: ScoringBundle): ScoringCommit {
  const seasons = new Map<string, ReturnType<typeof seasonAt>>()
  for (const fact of [...bundle.input.reviews, ...bundle.components]) {
    const season = seasonAt(fact.occurredAt)
    seasons.set(season.id, season)
  }
  const result: ScoringCommit = { status: bundle.input.reviewHistoryComplete ? "complete" : "pending", components: [], decisions: [], retainedComponentIds: [] }
  const decisions = new Map<string, ScoreDecision>()
  for (const season of [...seasons.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const score = scorePullRequestV1({ ...bundle.input, season: { ...season, eligibleFrom: bundle.eligibleFrom } })
    if (score.status === "pending") result.status = "pending"
    result.components.push(...score.components)
    result.decisions.push(...score.decisions.map(d => ({ ...d, seasonId: season.id })))
    for (const decision of score.decisions) {
      const review = bundle.input.reviews.find(r => r.id === decision.reviewId)!
      if (seasonAt(review.occurredAt).id === season.id) decisions.set(review.id, decision)
    }
  }
  const desired = new Set(result.components.map(c => c.id))
  // Preserve only genuinely unresolved components, not every component on a
  // partially known PR. Known deletions/exclusions still reverse immediately;
  // dismissed approvals retain earned credit independently of GitHub validity.
  for (const old of bundle.components) {
    if (!desired.has(old.id) && decisions.get(old.reviewId)?.status === "pending") {
      const review = bundle.input.reviews.find(r => r.id === old.reviewId)
      if (!review || (!review.effective && !review.approvalDismissed) || review.outcome === "dismissed") continue
      const candidate = retainKnownComponent(old, review, bundle.input)
      if (candidate) {
        result.components.push(candidate)
        result.retainedComponentIds.push(candidate.id)
      }
    }
  }
  // A follow-through cannot survive an explicitly invalidated base. Rescue is
  // attached to that base's source review and gets the same invalidation.
  result.components = result.components.filter(c => c.kind !== "follow_through" || !result.retainedComponentIds.includes(c.id) ||
    !bundle.components.some(base => base.participantId === c.participantId &&
      !["follow_through", "aging_pr_rescue"].includes(base.kind) &&
      decisions.get(base.reviewId)?.status === "excluded" && !result.components.some(next => next.id === base.id)))
  result.retainedComponentIds = result.retainedComponentIds.filter(id => result.components.some(c => c.id === id))
  result.components.sort((a, b) => a.id.localeCompare(b.id))
  return result
}

function retainKnownComponent(old: ScoreComponent, review: ReviewFact, input: ScoringBundle["input"]): ScoreComponent | null {
  const feedback = review.bodyPresent || input.comments.some(c => c.reviewId === review.id &&
    c.actorGithubUserId === review.actorGithubUserId && c.bodyPresent && c.effective)
  // Deleting known feedback is a real correction even if unrelated context is
  // unavailable. Never retain a ten-point comment-only review with no feedback.
  if (!feedback && review.feedbackComplete && review.outcome === "commented") return null
  if (!feedback && review.feedbackComplete && review.outcome === "approved" && old.kind === "approval_with_feedback") {
    return { ...old, kind: "approval", points: 8, explanation: "Approval retained; deleted feedback no longer earns feedback credit." }
  }
  return old
}

type ScoringApi = Pick<ReturnType<typeof createGitHubApiClient>, "readBackfillPage" | "readReviewGate">
export function createScoringProcessor(repository: ScoringRepository, getApi?: () => ScoringApi) {
  return async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const id = payload.pull_request_id
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid scoring job")
    let bundle = await repository.get(id)
    if (!bundle) return { disposition: "missing" }
    if (bundle.scope?.active && repository.enrich && getApi) {
      // Known reversals must not depend on GitHub being available right now.
      await repository.commit(id, bundle.revision, recomputeScores(bundle))
      const scope = bundle.scope, observedAt = new Date().toISOString(), items: unknown[] = []
      const api = getApi()
      let complete = true
      // Most reviews cost two list requests. Bound unusually large histories;
      // never label a truncated page as complete or run beyond the worker lease.
      const deadline = Date.now() + 25000
      for (const kind of ["reviews", "comments"] as const) {
        for (let page = 1; page <= 5; page++) {
          if (Date.now() > deadline) { complete = false; break }
          const response = await api.readBackfillPage(scope.githubInstallationId, scope.githubRepositoryId,
            scope.owner, scope.name, kind, page, scope.number)
          for (const item of response.items) {
            if (kind === "reviews" && String(item.state).toLowerCase() === "pending") continue
            const delivery: StoredGitHubDelivery = { id: "scoring-snapshot", github_installation_id: scope.githubInstallationId,
              event_name: kind === "reviews" ? "pull_request_review" : "pull_request_review_comment",
              action: kind === "reviews" ? "submitted" : "created", payload: {
                installation: { id: scope.githubInstallationId }, repository: { id: scope.githubRepositoryId },
                pull_request: { id: scope.githubPullRequestId, user: { id: bundle.input.pullRequest.authorGithubUserId } },
                [kind === "reviews" ? "review" : "comment"]: item,
              } }
            const normalized = kind === "reviews" ? await normalizeReviewContribution(delivery, true) : await normalizeReviewComment(delivery)
            if (!normalized) throw new Error("Scoring history was not normalized")
            const user = item.user as Record<string, unknown>
            items.push({ kind: kind === "reviews" ? "review" : "comment",
              fact: "review" in normalized ? normalized.review : normalized.comment,
              user: { id: user.id, login: user.login, type: user.type, avatar_url: user.avatar_url ?? null } })
          }
          if (!response.hasNext) break
          if (page === 5) complete = false
        }
        if (!complete) break
      }
      const gate = Date.now() <= deadline
        ? await api.readReviewGate(scope.githubInstallationId, scope.githubRepositoryId, scope.owner, scope.name, scope.number) : null
      if (complete) {
        // Gate timestamps are AFTER the API read. A post-review observation is
        // useful for the NEXT review, never proof of that review's prior state.
        const enriched = await repository.enrich(id, bundle.revision, items, observedAt,
          gate ? { ...gate, observedAt: new Date().toISOString() } : null)
        if (!enriched) return { disposition: "stale" }
        bundle = await repository.get(id)
        if (!bundle) return { disposition: "missing" }
      } else bundle.input.reviewHistoryComplete = false
    }
    const result = recomputeScores(bundle)
    const applied = await repository.commit(id, bundle.revision, result)
    return { disposition: applied ? result.status : "stale", components: result.components.length,
      retained: result.retainedComponentIds.length }
  }
}

export function createScoringRepository(url: string, key: string, request: typeof fetch = fetch): ScoringRepository {
  async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { apikey: key, "content-type": "application/json" }
    if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`
    const response = await request(`${url}/rest/v1/rpc/${name}`, {
      method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) throw new Error(`Scoring RPC ${name} failed with status ${response.status}`)
    return response.json() as Promise<T>
  }
  return {
    enqueue: () => rpc("enqueue_scoring_jobs", {}),
    get: id => rpc("get_pull_request_scoring_input", { p_pull_request_id: id }),
    commit: (id, revision, result) => rpc("commit_pull_request_scores", {
      p_pull_request_id: id, p_revision: revision, p_result: result,
    }),
    enrich: (id, revision, items, observedAt, gate) => rpc("enrich_pull_request_scoring", {
      p_pull_request_id: id, p_revision: revision, p_items: items, p_observed_at: observedAt, p_gate: gate,
    }),
  }
}
