import type { createGitHubApiClient } from "../_shared/github/client.ts"
import { normalizePullRequestLifecycle } from "./github-pull-request.ts"
import { normalizeReviewContribution } from "./github-review.ts"
import { normalizeReviewComment } from "./github-review-comment.ts"
import type { StoredGitHubDelivery } from "./github-installation.ts"

type ObjectValue = Record<string, unknown>
export type BackfillCursor = {
  phase: "pulls" | "reviews" | "comments"
  pull_page: number
  page: number
  index: number
  pulls: ObjectValue[]
  has_more_pulls: boolean
}
export type BackfillScope = {
  repository_id: string
  github_repository_id: number
  github_installation_id: number
  owner: string
  name: string
  run_id: string
  version: number
  cursor: BackfillCursor
  since_at: string
}
export type BackfillItem = { kind: "pull" | "review" | "comment"; fact: unknown; user?: ObjectValue; pull_id?: number }
export interface BackfillRepository {
  get(repositoryId: string, runId: string, version: number): Promise<BackfillScope | null>
  commit(scope: BackfillScope, items: BackfillItem[], next: BackfillCursor | null, observedAt: string): Promise<boolean>
}
type Api = Pick<ReturnType<typeof createGitHubApiClient>, "readBackfillPage">

function identity(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Missing backfill user")
  const user = value as ObjectValue
  return { id: user.id, login: user.login, type: user.type, avatar_url: user.avatar_url ?? null,
    ...(user.suspended_at ? { suspended_at: user.suspended_at } : {}) }
}

export function createBackfillProcessor(repository: BackfillRepository, getApi: () => Api) {
  return async (payload: ObjectValue): Promise<ObjectValue> => {
    const { repository_id: repositoryId, run_id: runId, version } = payload
    if (typeof repositoryId !== "string" || typeof runId !== "string" ||
      typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) {
      throw new Error("Invalid repository backfill job")
    }
    const scope = await repository.get(repositoryId, runId, version)
    if (!scope) return { disposition: "stale_or_inactive" }
    const cursor = scope.cursor
    const pull = cursor.pulls[cursor.index]
    const observedAt = new Date().toISOString()
    const page = await getApi().readBackfillPage(scope.github_installation_id, scope.github_repository_id,
      scope.owner, scope.name, cursor.phase, cursor.page, pull?.number as number | undefined)
    const items: BackfillItem[] = []
    let next: BackfillCursor | null
    function delivery(event: string, action: string, data: ObjectValue): StoredGitHubDelivery {
      return { id: `backfill-${runId}-${version}`, event_name: event, action,
        github_installation_id: scope!.github_installation_id,
        payload: { installation: { id: scope!.github_installation_id },
          repository: { id: scope!.github_repository_id }, ...data } }
    }

    if (cursor.phase === "pulls") {
      const cutoff = Date.parse(scope.since_at)
      if (!Number.isFinite(cutoff)) throw new Error("Invalid backfill lookback")
      const recent = page.items.filter(pr => {
        const updated = Date.parse(String(pr.updated_at))
        if (!Number.isFinite(updated)) throw new Error("Invalid backfill PR timestamp")
        return updated >= cutoff
      })
      const snapshots: ObjectValue[] = []
      for (const pr of recent) {
        const normalized = normalizePullRequestLifecycle(delivery("pull_request", "edited", { pull_request: pr }))!
        const user = identity(pr.user)
        items.push({ kind: "pull", fact: normalized.pullRequest, user })
        // Keep only the metadata required for child pages, never PR bodies/code.
        snapshots.push({ id: pr.id, number: pr.number, updated_at: pr.updated_at, user })
      }
      next = snapshots.length ? { ...cursor, phase: "reviews", page: 1, index: 0, pulls: snapshots,
        has_more_pulls: page.hasNext && recent.length === page.items.length } : null
    } else {
      if (!pull) throw new Error("Missing backfill PR cursor")
      for (const value of page.items) {
        if (cursor.phase === "reviews") {
          if (String(value.state).toLowerCase() === "pending") continue
          const normalized = await normalizeReviewContribution(
            delivery("pull_request_review", "submitted", { pull_request: pull, review: value }), true,
          )
          if (!normalized) throw new Error("Review snapshot was not normalized")
          items.push({ kind: "review", fact: normalized.review, user: identity(value.user), pull_id: pull.id as number })
        } else {
          const normalized = await normalizeReviewComment(
            delivery("pull_request_review_comment", "created", { pull_request: pull, comment: value }),
          )
          if (!normalized) throw new Error("Comment snapshot was not normalized")
          items.push({ kind: "comment", fact: normalized.comment, pull_id: pull.id as number })
        }
      }
      if (page.hasNext) next = { ...cursor, page: cursor.page + 1 }
      else if (cursor.phase === "reviews") next = { ...cursor, phase: "comments", page: 1 }
      else if (cursor.index + 1 < cursor.pulls.length) next = { ...cursor, phase: "reviews", page: 1, index: cursor.index + 1 }
      else if (cursor.has_more_pulls) next = { phase: "pulls", page: cursor.pull_page + 1,
        pull_page: cursor.pull_page + 1, index: 0, pulls: [], has_more_pulls: false }
      else next = null
    }
    const applied = await repository.commit(scope, items, next, observedAt)
    return { disposition: applied ? "applied" : "stale_or_inactive", phase: cursor.phase,
      items: items.length, complete: applied && next === null }
  }
}

export function createBackfillRepository(url: string, key: string, request: typeof fetch = fetch): BackfillRepository {
  async function rpc<T>(name: string, body: ObjectValue): Promise<T> {
    const headers: Record<string, string> = { apikey: key, "content-type": "application/json" }
    if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`
    const response = await request(`${url}/rest/v1/rpc/${name}`, {
      method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
    })
    if (!response.ok) throw new Error(`Backfill RPC ${name} failed with status ${response.status}`)
    return response.json() as Promise<T>
  }
  return {
    get(repositoryId, runId, version) {
      return rpc("get_repository_backfill", { p_repository_id: repositoryId, p_run_id: runId, p_version: version })
    },
    commit(scope, items, next, observedAt) {
      return rpc("commit_repository_backfill_page", { p_repository_id: scope.repository_id,
        p_run_id: scope.run_id, p_version: scope.version, p_items: items,
        p_next_cursor: next, p_observed_at: observedAt })
    },
  }
}
