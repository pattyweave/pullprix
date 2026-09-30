import type { Participant, Snapshot, TeamData } from './types'
export type DisplayStanding = Pick<Participant, 'participantId' | 'displayName' | 'points' | 'rank' | 'tied'> & { active: boolean; avatarUrl: string | null }
/** Discrete samples: no interpolated points, made-up positions, or historical health. */
export function adaptFrame(data: TeamData, sampledAt: string | null): { rows: DisplayStanding[]; totalPoints: number; snapshot: Snapshot | null } {
  const snapshot = sampledAt ? data.snapshots.find(s => s.sampledAt === sampledAt) ?? null : null
  const people = new Map(data.participants.map(p => [p.participantId, p]))
  return { snapshot, totalPoints: snapshot?.totalPoints ?? data.season.totalPoints,
    rows: snapshot ? snapshot.participants.map(p => ({ ...p, displayName: people.get(p.participantId)?.displayName ?? 'Past participant',
      active: people.get(p.participantId)?.active ?? false, avatarUrl: people.get(p.participantId)?.avatarUrl ?? null })) : data.participants }
}
