import { calculateStandings, type StandingsInput } from '../_shared/standings/v1.ts'
import { calculateReviewHealth, type HealthInput } from '../_shared/review-health/v1.ts'
import { activeSeason } from '../_shared/season/activation.ts'

export type ProductInput = { standings: StandingsInput; health: HealthInput | null }
export type ProductQuery = {
  resource: 'season' | 'standings' | 'snapshots' | 'review-health' | 'participant' | 'score-history' | 'seasons' | 'archive'
  installationId: number
  seasonId?: string
  participantId?: string
  offset: number
  limit: number
}
export class ProductError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code }
}
function page<T>(items: T[], offset: number, limit: number) {
  return { items: items.slice(offset, offset + limit), total: items.length,
    nextOffset: offset + limit < items.length ? offset + limit : null }
}
function avatar(value: string | null) {
  if (!value) return null
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'avatars.githubusercontent.com' ? url.href : null } catch { return null }
}
type Standing = ReturnType<typeof calculateStandings>['standings'][number]
function participant(row: Standing) {
  return { participantId: row.participantId, displayName: row.displayName, avatarUrl: avatar(row.avatarUrl),
    active: row.active, status: row.status, points: row.points, rank: row.rank, tied: row.tied,
    streak: row.streak, breakdown: row.breakdown, progress: null }
}
/** Domain-only responses. No provider identity, raw event, token or review body. */
export function productResponse(input: ProductInput, query: ProductQuery, asOf: string) {
  const season = activeSeason(asOf), source = input.standings
  if (source.seasonId !== season.id || (input.health && input.health.organizationId !== source.organizationId)) {
    throw new Error('Product input scope mismatch')
  }
  const standings = calculateStandings(source, asOf)
  const envelope = { contractVersion: '1', organizationId: source.organizationId, generatedAt: asOf,
    seasonId: season.id, historyBasis: 'current_corrected_ledger',
    status: 'provisional', pendingPullRequests: standings.pendingPullRequests }
  if (query.resource === 'season') return { ...envelope, season,
    entry: { eligibleFrom: standings.eligibleFrom }, totalPoints: standings.totalPoints,
    participantCount: standings.standings.length, progress: { status: 'unconfigured', policy: null, team: null } }
  if (query.resource === 'standings') return { ...envelope, totalPoints: standings.totalPoints,
    ...page(standings.standings.map(participant), query.offset, query.limit) }
  if (query.resource === 'review-health') {
    if (!input.health) throw new Error('Missing health input')
    const health = calculateReviewHealth(input.health, asOf)
    // This endpoint returns team-level metrics, keeping its response bounded.
    const aggregate = (value: typeof health.current) => {
      if (!value) return null
      const { individualShare: _individualShare, ...metrics } = value
      return metrics
    }
    return { ...envelope, health: { metricVersion: health.metricVersion, status: health.status,
      current: aggregate(health.current), baseline: aggregate(health.baseline), recent: aggregate(health.recent),
      agingQueue: { count: health.agingQueue.count, unknownReadinessCount: health.agingQueue.unknownReadiness.length } } }
  }
  if (query.resource === 'snapshots') {
    const start = Date.parse(standings.eligibleFrom), end = Date.parse(asOf), times: number[] = []
    if (start <= end) {
      times.push(start)
      for (let at = (Math.floor(start / 86400000) + 1) * 86400000; at < end; at += 86400000) times.push(at)
      if (end > start) times.push(end)
    }
    const selected = page(times, query.offset, query.limit)
    return { ...envelope, ...selected, items: selected.items.map(at => {
      const sampledAt = new Date(at).toISOString(), sample = calculateStandings(source, sampledAt)
      return { sampledAt, totalPoints: sample.totalPoints, progress: null, health: null,
        participants: sample.standings.map(row => ({ participantId: row.participantId,
          points: row.points, rank: row.rank, tied: row.tied, progress: null })) }
    }) }
  }
  const row = standings.standings.find(p => p.participantId === query.participantId)
  if (!row) throw new ProductError(404, 'participant_not_found')
  if (query.resource === 'participant') return { ...envelope, participant: participant(row) }
  const history = [...row.components].reverse().map(c => ({ id: c.id, occurredAt: c.occurredAt,
    kind: c.kind, points: c.points, explanation: c.explanation, scoringPolicyVersion: c.scoringPolicyVersion,
    pullRequest: { id: c.pullRequestId, number: c.pullRequestNumber, url: c.pullRequestUrl } }))
  return { ...envelope, participantId: row.participantId, totalPoints: row.points,
    ...page(history, query.offset, query.limit) }
}
