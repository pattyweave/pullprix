import type { authClient } from '../auth/client'
import type { LiveHealth, LiveSeason, Participant, ReadySetup, Scope, Snapshot, TeamData } from './types'
type Client = Pick<ReturnType<typeof authClient>, 'installationSetup' | 'product'>
export const REFRESH_MS = 15000
const REVERIFY_MS = 4 * 60 * 1000
const code = (error: unknown) => error instanceof Error ? error.message : 'product_unavailable'
const denied = (error: unknown) => ['access_denied', 'sign_in_again'].includes(code(error))
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_product_data')
  return value as Record<string, unknown>
}
function scope(value: unknown, organizationId: string, seasonId?: string): Scope {
  const data = object(value)
  if (data.contractVersion !== '1' || data.organizationId !== organizationId || typeof data.seasonId !== 'string' ||
    (seasonId && data.seasonId !== seasonId) || typeof data.generatedAt !== 'string' || !Number.isFinite(Date.parse(data.generatedAt))) {
    throw new Error('invalid_product_data')
  }
  return value as Scope
}
/** Per-mount, per-team cache. Never put private data in a shared demo cache or storage. */
export function createTeamLoader(client: Client, installationId: number, now = Date.now) {
  let setup: ReadySetup | null = null, verifiedAt = -Infinity, removedRepositoryCount = 0
  let snapshotCache: { key: string; at: number; rows: Snapshot[] } | null = null
  let inFlight: Promise<TeamData> | null = null
  async function verify(retry = false) {
    const response = await client.installationSetup(installationId, retry)
    if (response.setup.status !== 'ready') throw new Error('waiting_for_webhook')
    const names = new Set(response.setup.repositories.map(r => r.name))
    removedRepositoryCount = setup?.repositories.filter(r => !names.has(r.name)).length ?? 0
    setup = response.setup; verifiedAt = now()
  }
  async function pages<T>(resource: 'standings' | 'snapshots', organizationId: string, seasonId: string): Promise<T[]> {
    const rows: T[] = [], limit = resource === 'snapshots' ? 7 : 100
    let offset = 0
    for (let page = 0; page < (resource === 'snapshots' ? 6 : 10); page++) {
      const raw = await client.product({ installationId, resource, offset, limit })
      scope(raw, organizationId, seasonId)
      const data = object(raw)
      if (!Array.isArray(data.items) || data.items.length > limit || !Number.isInteger(data.total) || (data.total as number) < 0) throw new Error('invalid_product_data')
      rows.push(...data.items as T[])
      if (data.nextOffset === null) {
        if (rows.length !== data.total) throw new Error('data_changed')
        return rows
      }
      if (data.nextOffset !== offset + limit || data.items.length !== limit) throw new Error('invalid_product_data')
      offset += limit
    }
    throw new Error('invalid_product_data')
  }
  async function read(): Promise<TeamData> {
    const organizationId = setup!.organization.id
    const raw = await client.product({ installationId, resource: 'season' })
    const candidate = object(raw)
    if (candidate.contractVersion === '1' && candidate.organizationId === organizationId && candidate.season === null) throw new Error('no_active_season')
    const envelope = scope(raw, organizationId), season = raw as LiveSeason
    if (season.season?.id !== envelope.seasonId || !Number.isFinite(season.totalPoints)) throw new Error('invalid_product_data')
    const [participants, healthRaw] = await Promise.all([
      pages<Participant>('standings', organizationId, envelope.seasonId),
      client.product({ installationId, resource: 'review-health' }),
    ])
    scope(healthRaw, organizationId, envelope.seasonId)
    const health = healthRaw as LiveHealth
    if (!health.health || !health.health.agingQueue || !Array.isArray(participants) || participants.some(p =>
      !p.participantId || typeof p.displayName !== 'string' || !Number.isFinite(p.points) || !p.streak) ||
      new Set(participants.map(p => p.participantId)).size !== participants.length) throw new Error('invalid_product_data')
    // Reject a read spanning a scoring update; the next refresh obtains a coherent view.
    if (participants.length !== season.participantCount || participants.reduce((sum, p) => sum + p.points, 0) !== season.totalPoints) throw new Error('data_changed')
    const key = JSON.stringify([organizationId, envelope.seasonId, participants.map(p => [p.participantId, p.points, p.rank])])
    if (!snapshotCache || snapshotCache.key !== key || now() - snapshotCache.at >= 60000) {
      const snapshots = await pages<Snapshot>('snapshots', organizationId, envelope.seasonId)
      if (snapshots.some((s, i) => !Number.isFinite(Date.parse(s.sampledAt)) || !Array.isArray(s.participants) ||
        (i > 0 && Date.parse(s.sampledAt) <= Date.parse(snapshots[i - 1]!.sampledAt)))) throw new Error('invalid_product_data')
      snapshotCache = { key, at: now(), rows: snapshots }
    }
    return { setup: setup!, season, participants, health, snapshots: snapshotCache.rows, removedRepositoryCount }
  }
  async function run() {
    try {
      const importing = setup && (!setup.repositories.length || setup.repositories.some(r => r.status !== 'completed'))
      if (!setup || now() - verifiedAt >= (importing ? 60000 : REVERIFY_MS)) await verify()
      try { return await read() }
      catch (error) {
        if (code(error) !== 'access_denied') throw error
        // Exactly one GitHub recheck and read retry, never a retry loop.
        setup = null; snapshotCache = null
        await verify()
        return await read()
      }
    } catch (error) {
      snapshotCache = null
      if (denied(error)) { setup = null; verifiedAt = -Infinity }
      throw error
    }
  }
  return {
    load(freshSnapshots = false) {
      if (inFlight) return inFlight
      if (freshSnapshots) { snapshotCache = null; verifiedAt = -Infinity }
      return inFlight = run().finally(() => { inFlight = null })
    },
    async retryImports() { await verify(true); snapshotCache = null; return this.load() },
  }
}
