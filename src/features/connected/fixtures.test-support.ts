import { vi } from 'vitest'
import { activeSeason } from '../../../supabase/functions/_shared/season/activation'
import type { TeamData } from './types'
export const now = '2026-09-28T20:00:00Z'
export function fixture(): TeamData {
  const scope = { contractVersion: '1' as const, organizationId: 'org', seasonId: '2026-09', generatedAt: now, pendingPullRequests: 1 }
  return { setup: { status: 'ready', canManage: true, role: 'administrator', organization: { id: 'org', name: 'Live Team', slug: 'live' }, roster: [],
    repositories: [{ name: 'Live/repo', status: 'completed', pagesCompleted: 1 }] },
    season: { ...scope, season: activeSeason(now), totalPoints: 8, participantCount: 2 },
    participants: ['reviewer', 'zero'].map((id, i) => ({ participantId: id, displayName: id === 'reviewer' ? 'Real Reviewer' : 'New Driver', avatarUrl: null, active: true,
      points: i === 0 ? 8 : 0, rank: i === 0 ? 1 : null, tied: false, status: i === 0 ? 'started' : 'not_started', streak: { current: 1, best: 1 }, progress: null })),
    health: { ...scope, health: { status: 'partial', current: { participation: { reviewers: 1, roster: 2, percentage: 50 }, usefulReviews: 1, medianFirstReviewMs: null, averageDailyAgingQueue: null },
      baseline: null, recent: null, agingQueue: { count: 0, unknownReadinessCount: 0 } } },
    snapshots: [{ sampledAt: '2026-09-27T12:00:00Z', totalPoints: 0, participants: [{ participantId: 'reviewer', points: 0, rank: null, tied: false }] }] }
}
export function mockClient(data = fixture()) {
  return { installationSetup: vi.fn(async () => ({ setup: data.setup, season: data.season.season })),
    product: vi.fn(async (query: { resource: string; offset?: number }) => {
      if (query.resource === 'season') return data.season
      if (query.resource === 'review-health') return data.health
      const rows = query.resource === 'standings' ? data.participants : data.snapshots
      return { ...data.season, items: rows, total: rows.length, nextOffset: null }
    }) }
}
