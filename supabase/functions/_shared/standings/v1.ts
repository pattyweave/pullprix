import type { ScoreComponent } from "../scoring/v1.ts"
import { seasonAt } from "../scoring/season.ts"

export type StandingsInput = {
  organizationId: string
  seasonId: string
  eligibleFrom: string
  participants: { id: string; displayName: string; avatarUrl: string | null;
    eligible: boolean; active: boolean; joinedAt: string; leftAt: string | null }[]
  components: ScoreComponent[]
  pendingPullRequests: number
}

function time(value: string) {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error("Timestamp must include a timezone")
  }
  return Date.parse(value)
}
const day = (at: number) => Math.floor(at / 86_400_000)

/** Read model only: never awards points or changes eligibility/scoring facts. */
export function calculateStandings(input: StandingsInput, asOf: string, finalized = false) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.seasonId)) throw new Error("Invalid season ID")
  const season = seasonAt(`${input.seasonId}-15T12:00:00Z`)
  const start = time(season.startsAt), end = time(season.endsAt), now = time(asOf)
  if (finalized && (now < end || input.pendingPullRequests > 0)) throw new Error("Season is not ready for final standings")
  const cutoff = Math.min(now, end - 1), entry = time(input.eligibleFrom)
  // A completed season's streak is measured at its closing day, never today's.
  const today = day(cutoff)
  const seen = new Map<string, ScoreComponent>()
  for (const component of input.components) {
    if (component.organizationId !== input.organizationId) throw new Error("Cross-organization score component")
    if (component.seasonId !== input.seasonId || component.status !== "effective") continue
    const occurred = time(component.occurredAt)
    if (occurred < Math.max(start, entry) || occurred >= end || occurred > now) continue
    const previous = seen.get(component.id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(component)) throw new Error("Conflicting score component")
    seen.set(component.id, component)
  }
  const rows = input.participants.filter(p => p.eligible && time(p.joinedAt) <= cutoff &&
    (p.leftAt === null || time(p.leftAt) >= start) && entry <= cutoff).map(p => {
    // The ledger already enforces activity/access windows. Retain earned work
    // after departure; canonical discovery time does not move old earned scores.
    const components = [...seen.values()].filter(c => c.participantId === p.id)
      .sort((a, b) => time(a.occurredAt) - time(b.occurredAt) || a.id.localeCompare(b.id))
    const days = [...new Set(components.filter(c => c.kind !== "aging_pr_rescue")
      .map(c => day(time(c.occurredAt))))].sort((a, b) => a - b)
    let run = 0, best = 0, previous = -Infinity
    for (const current of days) { run = current === previous + 1 ? run + 1 : 1; best = Math.max(best, run); previous = current }
    const current = previous >= today - 1 ? run : 0
    const points = components.reduce((sum, c) => sum + c.points, 0)
    const breakdown: Partial<Record<ScoreComponent["kind"], number>> = {}
    for (const c of components) breakdown[c.kind] = (breakdown[c.kind] ?? 0) + c.points
    return { participantId: p.id, displayName: p.displayName, avatarUrl: p.avatarUrl,
      active: p.active, status: points > 0 ? "started" : "not_started", points,
      rank: null as number | null, tied: false, champion: false, coChampion: false,
      streak: { current, best }, components, breakdown }
  }).sort((a, b) => b.points - a.points || a.participantId.localeCompare(b.participantId))
  // Stable display order inside a tie is not a sporting tie-breaker. Zero-point
  // participants have no position until their first earned contribution.
  const counts = new Map<number, number>()
  for (const row of rows) counts.set(row.points, (counts.get(row.points) ?? 0) + 1)
  let rank = 0
  rows.forEach((row, index) => {
    if (row.points === 0) return
    if (index === 0 || row.points !== rows[index - 1]!.points) rank = index + 1
    row.rank = rank
    row.tied = counts.get(row.points)! > 1
    row.champion = finalized && rank === 1
    row.coChampion = row.champion && row.tied
  })
  return { organizationId: input.organizationId, season, asOf,
    eligibleFrom: new Date(Math.max(entry, start)).toISOString(),
    status: finalized ? "final" : "provisional", pendingPullRequests: input.pendingPullRequests,
    totalPoints: rows.reduce((sum, row) => sum + row.points, 0), standings: rows }
}
