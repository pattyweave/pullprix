import type { TimingRow } from '../../components/hud/TimingTower'
import type { TrackDriver } from '../../components/hud/TrackMap'
import type { ProfileBadge } from '../../components/hud/DriverProfile'
import { JACAREPAGUA } from '../track/circuits'
import circuitAssetUrl from '../../assets/tracks/Jacarepagua Tour Vector.svg?url'
import type { SeasonSnapshot, ThemePack } from './types'

const COLORS = ['var(--pp-team-blue)', 'var(--pp-team-red)', 'var(--pp-team-amber)', 'var(--pp-team-green)', 'var(--pp-team-violet)', 'var(--pp-team-pink)'] as const
function hash(value: string) {
  let result = 2166136261
  for (const char of value) result = Math.imul(result ^ char.codePointAt(0)!, 16777619) >>> 0
  return result
}
export const RACING_MANIFEST = {
  id: 'racing', version: '1.0.0', supportedContractVersion: '1',
  name: 'Pull Prix Championship', circuitId: JACAREPAGUA.id,
  assets: { circuit: circuitAssetUrl },
  vocabulary: { participant: { singular: 'driver', plural: 'drivers' }, standings: 'Championship',
    points: 'Championship points', notStarted: 'On the Start Line', inactive: 'Inactive driver',
    finalStage: 'Final Lap', champion: { singular: 'Champion', plural: 'Co-Champions' } },
} as const

export type RacingMechanicState = {
  seasonId: string
  generatedAt: string
  drivers: { id: string; progress: number; completedLap: boolean; status: string }[]
}
export type RacingViewModel = {
  title: string
  phaseLabel: string
  circuit: typeof JACAREPAGUA
  circuitAssetUrl: string
  trackDrivers: TrackDriver[]
  timingRows: TimingRow[]
  drivers: { id: string; name: string; code: string; number: number; color: string; avatarUrl: string | null;
    statusLabel: string; title: string; points: number; rank: number | null; tied: boolean;
    currentStreak: number; bestStreak: number; badges: ProfileBadge[] }[]
  pendingPullRequests: number
}
function assertSnapshot(snapshot: Readonly<SeasonSnapshot>) {
  if (snapshot.contractVersion !== '1' || snapshot.season.themePack.id !== RACING_MANIFEST.id ||
    snapshot.season.themePack.version !== RACING_MANIFEST.version) throw new Error('Unsupported racing theme contract/version')
}
function badgesFor(participant: SeasonSnapshot['participants'][number], completed: boolean): ProfileBadge[] {
  const badges: ProfileBadge[] = []
  const base = participant.scoreComponents.find(c => !['follow_through', 'aging_pr_rescue'].includes(c.kind))
  if (base) badges.push({ id: 'first_review', icon: '🏁', name: 'Off the Grid', rarity: 'common',
    description: 'Earned a first qualifying review this season.', unlockedDate: base.occurredAt })
  const follow = participant.scoreComponents.find(c => c.kind === 'follow_through')
  if (follow) badges.push({ id: 'follow_through', icon: '🔧', name: 'Pit Crew', rarity: 'rare',
    description: 'Returned for qualifying follow-through after new commits.', unlockedDate: follow.occurredAt })
  const rescue = participant.scoreComponents.find(c => c.kind === 'aging_pr_rescue')
  if (rescue) badges.push({ id: 'aging_pr_rescue', icon: '🛟', name: 'Safety Car', rarity: 'rare',
    description: 'Earned an aging PR rescue bonus.', unlockedDate: rescue.occurredAt })
  if (participant.progress.normalized >= 1) badges.push({ id: 'progress_complete', icon: '🏎️', name: 'Full Circuit', rarity: 'epic',
    description: 'Reached the season progress target. Championship points keep counting.' })
  if (completed && participant.achievementIds.includes('co_champion')) badges.push({ id: 'co_champion', icon: '🏆', name: 'Co-Champion', rarity: 'legendary', description: 'Shared first place in the completed championship.' })
  else if (completed && participant.achievementIds.includes('champion')) badges.push({ id: 'champion', icon: '🏆', name: 'Champion', rarity: 'legendary', description: 'Finished first in the completed championship.' })
  return badges
}
export const racingThemePack: ThemePack<RacingMechanicState, RacingViewModel> = {
  manifest: RACING_MANIFEST,
  deriveMechanicState(snapshot) {
    assertSnapshot(snapshot)
    return { seasonId: snapshot.season.id, generatedAt: snapshot.generatedAt,
      drivers: snapshot.participants.map(p => {
        if (!Number.isFinite(p.progress.normalized) || p.progress.normalized < 0 || p.progress.normalized > 1) throw new Error('Invalid normalized progress')
        return { id: p.participantId, progress: p.progress.normalized, completedLap: p.progress.normalized === 1, status: p.status }
      }) }
  },
  buildViewModel({ snapshot, mechanicState }) {
    assertSnapshot(snapshot)
    // Reject accidentally pairing a replay frame with another frame's mechanics.
    const expected = racingThemePack.deriveMechanicState(snapshot)
    if (JSON.stringify(expected) !== JSON.stringify(mechanicState)) throw new Error('Racing mechanic state does not match snapshot')
    const completed = snapshot.lifecycleState === 'completed'
    const drivers = snapshot.participants.map(p => {
      const identity = hash(p.participantId), badges = badgesFor(p, completed)
      const statusLabel = p.status === 'not_started' ? RACING_MANIFEST.vocabulary.notStarted :
        p.status === 'inactive' ? RACING_MANIFEST.vocabulary.inactive : 'Racing'
      const title = badges.some(b => b.id === 'co_champion') ? 'Co-Champion' : badges.some(b => b.id === 'champion') ? 'Champion' :
        p.status === 'not_started' ? 'On the Start Line' : 'Championship Driver'
      return { id: p.participantId, name: p.displayName, code: p.displayName.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || 'DRV',
        number: identity % 999 + 1, color: COLORS[identity % COLORS.length]!, avatarUrl: p.avatarUrl,
        statusLabel, title, points: p.points, rank: p.rank, tied: p.tied, currentStreak: p.streak.current, bestStreak: p.streak.best, badges }
    })
    const leader = Math.max(0, ...drivers.map(d => d.points))
    const phases: Record<string, string> = { scheduled: 'On the Grid', active: 'Race in Progress', final_stage: 'Final Lap', finalizing: 'Results Pending', completed: 'Chequered Flag' }
    return { title: snapshot.season.name, phaseLabel: phases[snapshot.lifecycleState]!, circuit: JACAREPAGUA, circuitAssetUrl,
      trackDrivers: mechanicState.drivers.map(d => ({ id: d.id, progress: d.progress,
        name: drivers.find(p => p.id === d.id)!.name,
        label: drivers.find(p => p.id === d.id)!.code, color: drivers.find(p => p.id === d.id)!.color })),
      timingRows: drivers.map(d => ({ id: d.id, position: d.rank, initials: d.code, teamColor: d.color, points: d.points,
        gap: d.rank === null ? d.statusLabel : d.rank === 1 ? (d.tied ? 'Joint lead' : 'Lead') : leader - d.points })),
      drivers, pendingPullRequests: snapshot.pendingPullRequests }
  },
}
