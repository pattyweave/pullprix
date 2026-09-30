import { calculateStandings, type StandingsInput } from '../_shared/standings/v1.ts'
import { seasonAt } from '../_shared/scoring/season.ts'
export type FinalizationInput = { organizationId: string; seasonId: string; startsAt: string; endsAt: string;
  definition: { definitionVersion: number; name: string; themePack: { id: string; version: string }; scoringPolicyVersion: string; progressPolicy: null };
  input: StandingsInput; revision: string }
export function buildSeasonResult(bundle: FinalizationInput) {
  const calendar = seasonAt(`${bundle.seasonId}-15T12:00:00Z`)
  if (bundle.organizationId !== bundle.input.organizationId || bundle.seasonId !== bundle.input.seasonId ||
    Date.parse(bundle.startsAt) !== Date.parse(calendar.startsAt) || Date.parse(bundle.endsAt) !== Date.parse(calendar.endsAt) ||
    bundle.definition.definitionVersion !== 1 || bundle.definition.scoringPolicyVersion !== 'v1' || bundle.definition.themePack.id !== 'racing' ||
    bundle.definition.themePack.version !== '1.0.0' || bundle.definition.progressPolicy !== null) throw new Error('Invalid finalization scope')
  const result = calculateStandings(bundle.input, calendar.endsAt, true)
  const avatar = (value: string | null) => {
    try { const url = new URL(value ?? ''); return url.protocol === 'https:' && url.hostname === 'avatars.githubusercontent.com' ? url.href : null } catch { return null }
  }
  return { contractVersion: '1', organizationId: bundle.organizationId, seasonId: bundle.seasonId,
    status: 'completed', historyBasis: 'frozen_at_finalization', startsAt: calendar.startsAt, endsAt: calendar.endsAt,
    definition: bundle.definition, eligibleFrom: result.eligibleFrom, totalPoints: result.totalPoints, health: null, progress: null,
    participants: result.standings.map(p => ({ participantId: p.participantId, displayName: p.displayName,
      avatarUrl: avatar(p.avatarUrl), points: p.points, rank: p.rank, tied: p.tied, champion: p.champion,
      coChampion: p.coChampion, streak: p.streak, breakdown: p.breakdown })) }
}
export interface SeasonFinalizationRepository {
  inputs(): Promise<FinalizationInput[]>
  commit(bundle: FinalizationInput, snapshot: ReturnType<typeof buildSeasonResult>): Promise<boolean>
}
export function createSeasonFinalizer(repository: SeasonFinalizationRepository) {
  return async () => {
    const inputs = await repository.inputs()
    if (inputs.length > 2) throw new Error('Finalization batch too large')
    let completed = 0
    for (const input of inputs) if (await repository.commit(input, buildSeasonResult(input))) completed++
    return completed
  }
}
export function createSeasonFinalizationRepository(url: string, key: string, request: typeof fetch = fetch): SeasonFinalizationRepository {
  async function rpc<T>(name: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json' }
    if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`
    const response = await request(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers,
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000), redirect: 'error' })
    if (!response.ok) throw new Error(`Season finalization RPC failed: ${response.status}`)
    return response.json()
  }
  return { inputs: () => rpc('get_season_finalization_inputs', {}),
    commit: (bundle, snapshot) => rpc('commit_season_result', { p_organization_id: bundle.organizationId,
      p_season_id: bundle.seasonId, p_revision: bundle.revision, p_snapshot: snapshot }) }
}
