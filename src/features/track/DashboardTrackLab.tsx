import { useMemo, useState } from 'react'
import { activeSeason } from '../../../supabase/functions/_shared/season/activation'
import { LiveDashboard } from '../connected/TeamDashboard'
import { ReviewQueueView } from '../connected/ReviewQueue'
import type { TeamData } from '../connected/types'
import { SUZUKA, SPA, INTERLAGOS, JACAREPAGUA } from './circuits'
import { SeasonWelcome } from '../setup/SeasonWelcome'
import { TeamRoster } from '../setup/TeamRoster'
import './dashboard-track-lab.css'

const circuits = [SUZUKA, SPA, INTERLAGOS, JACAREPAGUA]
const noop = async () => {}
const scenarios = { standard: 'Standard team', large: 'Large roster / long names', empty: 'Empty team', attention: 'Import trouble / partial data' }
type Scenario = keyof typeof scenarios
function sampleTeam(scenario: Scenario): TeamData {
  const now = new Date().toISOString(), season = activeSeason(now)
  const scope = { contractVersion: '1' as const, organizationId: 'sample-team', seasonId: season.id, generatedAt: now, pendingPullRequests: scenario === 'empty' ? 0 : 1 }
  const names = scenario === 'empty' ? [] : scenario === 'large' ? Array.from({ length: 16 }, (_, index) => index === 0 ? 'AlexandriaVeryLongUnbrokenContributorName' : `Sample contributor ${index + 1}`) : ['we4ve', 'williamsaintweaver', 'Hollistud', 'weavemoney', 'pattyweave']
  const points = names.map((_, index) => [22, 16, 8, 8, 0][index] ?? Math.max(0, 8 - Math.floor(index / 2)))
  const rank = (score: number, scores: number[]) => score ? scores.filter(other => other > score).length + 1 : null
  const tied = (score: number, scores: number[]) => score > 0 && scores.filter(other => other === score).length > 1
  return {
    setup: { status: 'ready', canManage: scenario === 'attention', role: scenario === 'attention' ? 'administrator' : 'participant', organization: { id: 'sample-team', name: 'Track preview · sample team', slug: 'sample-team' }, roster: names.map((name, index) => ({ id: name, githubUserId: index + 1, login: `sample-${index + 1}`, displayName: name, avatarUrl: null, active: index !== 15, joinedAt: season.startsAt })), repositories: [{ name: 'sample/repository', status: scenario === 'attention' ? 'failed' : 'completed', pagesCompleted: 1 }] },
    season: { ...scope, season, totalPoints: points.reduce((sum, score) => sum + score, 0), participantCount: names.length },
    participants: names.map((name, i) => ({ participantId: name, displayName: name, points: points[i]!, avatarUrl: null, active: i !== 15, rank: rank(points[i]!, points), tied: tied(points[i]!, points), status: points[i] ? 'started' : 'not_started', streak: { current: points[i] ? 1 : 0, best: 2 }, progress: null })),
    health: { ...scope, health: { status: scenario === 'attention' ? 'partial' : 'complete', current: scenario === 'attention' ? null : { participation: { reviewers: Math.max(0, names.length - 1), roster: names.length, percentage: names.length ? (names.length - 1) / names.length * 100 : null }, usefulReviews: names.length ? 6 : 0, medianFirstReviewMs: names.length ? 360000 : null, averageDailyAgingQueue: 0 }, baseline: null, recent: null, agingQueue: { count: 0, unknownReadinessCount: 0 } } },
    snapshots: [0, 1, 2].map(step => {
      const scores = points.map(score => Math.floor(score * step / 3))
      return { sampledAt: new Date(Date.parse(season.startsAt) + step * 3600000).toISOString(), totalPoints: scores.reduce((sum, score) => sum + score, 0), participants: names.map((name, i) => ({ participantId: name, points: scores[i]!, rank: rank(scores[i]!, scores), tied: tied(scores[i]!, scores) })) }
    }),
  }
}
/** The real dashboard component, supplied with local fixtures and a non-fetching queue. */
export function DashboardTrackLab() {
  const [scenario, setScenario] = useState<Scenario>('standard')
  const [view, setView] = useState('dashboard')
  const data = useMemo(() => sampleTeam(scenario), [scenario])
  const [id, setId] = useState(SUZUKA.id)
  const circuit = circuits.find(item => item.id === id)!
  return <div className="dashboard-track-lab">
    <div className="dashboard-track-lab-controls"><a href="/track-lab">← Comparison</a><label>Circuit <select value={id} onChange={event => setId(event.target.value)}>{circuits.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Scenario <select value={scenario} onChange={event => setScenario(event.target.value as Scenario)}>{Object.entries(scenarios).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Preview <select value={view} onChange={event => setView(event.target.value)}><option value="dashboard">Dashboard</option><option value="setup">Season welcome / roster</option></select></label><span>Local sample data</span></div>
    {view === 'setup' ? <main className="dashboard-track-lab-setup"><div className="mx-auto max-w-2xl px-6 py-8"><h1 className="text-2xl font-semibold">Season setup preview</h1><SeasonWelcome season={data.season.season} onRollover={noop} /><TeamRoster participants={data.setup.roster} importing={scenario === 'attention'} /></div></main> :
    <LiveDashboard key={scenario} data={data} circuit={circuit} installationId={42} refreshing={false} refresh={noop} retryImports={noop}
      reviewQueue={<ReviewQueueView loading={false} retry={() => {}} data={scenario === 'attention' ? null : { contractVersion: '1', organizationId: 'sample-team', generatedAt: data.season.generatedAt, status: 'complete', nextId: scenario === 'empty' ? null : 'sample-pr', items: scenario === 'empty' ? [] : [{ id: 'sample-pr', repository: 'sample/repository', number: 1, title: 'Sample PR needing review', url: '#sample-review', reason: 'initial', conflict: null, openedAt: data.season.generatedAt }] }} />} />}
  </div>
}
