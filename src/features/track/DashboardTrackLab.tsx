import { useState } from 'react'
import { activeSeason } from '../../../supabase/functions/_shared/season/activation'
import { LiveDashboard } from '../connected/TeamDashboard'
import { ReviewQueueView } from '../connected/ReviewQueue'
import type { TeamData } from '../connected/types'
import { SUZUKA, SPA, INTERLAGOS, JACAREPAGUA } from './circuits'
import './dashboard-track-lab.css'

const circuits = [SUZUKA, SPA, INTERLAGOS, JACAREPAGUA]
const noop = async () => {}
function sampleTeam(): TeamData {
  const now = new Date().toISOString(), season = activeSeason(now)
  const scope = { contractVersion: '1' as const, organizationId: 'sample-team', seasonId: season.id, generatedAt: now, pendingPullRequests: 1 }
  const names = ['we4ve', 'williamsaintweaver', 'Hollistud', 'weavemoney', 'pattyweave']
  const points = [22, 16, 8, 8, 0]
  return {
    setup: { status: 'ready', canManage: false, role: 'participant', organization: { id: 'sample-team', name: 'Track preview · sample team', slug: 'sample-team' }, roster: [], repositories: [{ name: 'sample/repository', status: 'completed', pagesCompleted: 1 }] },
    season: { ...scope, season, totalPoints: 54, participantCount: 5 },
    participants: names.map((name, i) => ({ participantId: name, displayName: name, points: points[i]!, avatarUrl: null, active: true, rank: i === 4 ? null : i === 3 ? 3 : i + 1, tied: i === 2 || i === 3, status: i === 4 ? 'not_started' : 'started', streak: { current: i === 4 ? 0 : 1, best: 2 }, progress: null })),
    health: { ...scope, health: { status: 'complete', current: { participation: { reviewers: 4, roster: 5, percentage: 80 }, usefulReviews: 6, medianFirstReviewMs: 360000, averageDailyAgingQueue: 0 }, baseline: null, recent: null, agingQueue: { count: 0, unknownReadinessCount: 0 } } },
    snapshots: [0, 1, 2].map(step => ({ sampledAt: new Date(Date.parse(season.startsAt) + step * 3600000).toISOString(), totalPoints: points.reduce((sum, score) => sum + Math.floor(score * step / 3), 0), participants: names.map((name, i) => ({ participantId: name, points: Math.floor(points[i]! * step / 3), rank: i === 4 || step === 0 ? null : i === 3 ? 3 : i + 1, tied: step > 0 && (i === 2 || i === 3) })) })),
  }
}
/** The real dashboard component, supplied with local fixtures and a non-fetching queue. */
export function DashboardTrackLab() {
  const [data] = useState(sampleTeam)
  const [id, setId] = useState(SUZUKA.id)
  const circuit = circuits.find(item => item.id === id)!
  return <div className="dashboard-track-lab">
    <div className="dashboard-track-lab-controls"><a href="/track-lab">← Comparison</a><label>Preview circuit <select value={id} onChange={event => setId(event.target.value)}>{circuits.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span>Local sample data</span></div>
    <LiveDashboard data={data} circuit={circuit} installationId={0} refreshing={false} refresh={noop} retryImports={noop}
      reviewQueue={<ReviewQueueView loading={false} retry={() => {}} data={{ contractVersion: '1', organizationId: 'sample-team', generatedAt: data.season.generatedAt, status: 'complete', nextId: 'sample-pr', items: [{ id: 'sample-pr', repository: 'sample/repository', number: 1, title: 'Sample PR needing review', url: '#sample-review', reason: 'initial', conflict: null, openedAt: data.season.generatedAt }] }} />} />
  </div>
}
