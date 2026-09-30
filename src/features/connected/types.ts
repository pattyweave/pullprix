import type { InstallationSetup } from '../setup/types'
export type ReadySetup = Extract<InstallationSetup['setup'], { status: 'ready' }>
export type Scope = { contractVersion: '1'; organizationId: string; seasonId: string; generatedAt: string; pendingPullRequests: number }
export type LiveSeason = Scope & { season: InstallationSetup['season']; totalPoints: number; participantCount: number }
export type Participant = { participantId: string; displayName: string; avatarUrl: string | null; active: boolean;
  points: number; rank: number | null; tied: boolean; status: string; streak: { current: number; best: number }; progress: null }
export type Snapshot = { sampledAt: string; totalPoints: number; participants: Pick<Participant, 'participantId' | 'points' | 'rank' | 'tied'>[] }
export type HealthMetrics = { participation: { reviewers: number; roster: number; percentage: number | null };
  usefulReviews: number; medianFirstReviewMs: number | null; averageDailyAgingQueue: number | null }
export type LiveHealth = Scope & { health: { status: string; current: HealthMetrics | null; baseline: HealthMetrics | null;
  recent: HealthMetrics | null; agingQueue: { count: number; unknownReadinessCount: number } } }
export type TeamData = { removedRepositoryCount?: number; setup: ReadySetup; season: LiveSeason; participants: Participant[]; health: LiveHealth; snapshots: Snapshot[] }
export type TeamState = { data: TeamData | null; loading: boolean; error: string; refreshing: boolean }
