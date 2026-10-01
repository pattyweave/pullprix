import { TrackMap } from '../../components/hud/TrackMap'
import { JACAREPAGUA } from '../track/circuits'
import { useSnapshotReplay } from './useSnapshotReplay'
import { trackDrivers } from './track-drivers'
import { Component, useState, type CSSProperties, type ReactNode } from 'react'
import { useParams } from '@tanstack/react-router'
import { SeasonCountdown } from '../setup/SeasonCountdown'
import { ScoringSummary } from '../setup/ScoringSummary'
import { Activity, Flag, History, Radio, Users, Settings2, Play, Pause } from 'lucide-react'
import './team-dashboard.css'
import { ShareTeamLink } from '../setup/ShareTeamLink'
import { RACING_MANIFEST } from '../themes'
import { useTeamData } from './useTeamData'
import { adaptFrame } from './adapter'
import { TeamNotice } from './TeamNotice'
import { recoveryMessages } from './recovery-messages'
import type { TeamData } from './types'
const button = 'min-h-11 rounded border border-line px-3 py-2 text-sm transition-colors hover:bg-surface disabled:opacity-50'
class DashboardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Team dashboard</h1>
      <p role="alert" className="my-5">We couldn’t display your team. Please reload and try again.</p>
      <button className={button} onClick={() => window.location.reload()}>Reload dashboard</button></main> : this.props.children
  }
}
export function TeamRoute() {
  const { installationId } = useParams({ from: '/teams/$installationId' })
  return <TeamPage rawInstallationId={installationId} />
}
export function TeamPage({ rawInstallationId }: { rawInstallationId?: string } = {}) {
  const raw = rawInstallationId ?? window.location.pathname.split('/')[2], installationId = raw && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN
  if (!Number.isSafeInteger(installationId)) return <main className="p-8"><p role="alert">This team link is incomplete.</p><a href="/sign-in" className="underline">Your account</a></main>
  return <DashboardBoundary key={installationId}><ConnectedTeam key={installationId} installationId={installationId} /></DashboardBoundary>
}
function ConnectedTeam({ installationId }: { installationId: number }) {
  const state = useTeamData(installationId), next = encodeURIComponent(`/teams/${installationId}`)
  if (!state.data) return <main className="mx-auto max-w-xl px-6 py-16">
    <h1 className="text-3xl font-semibold">Team dashboard</h1>
    {state.loading ? <p role="status" className="mt-6">Loading your team…</p> : <>
      <p role="alert" className="my-6">{recoveryMessages[state.error] ?? recoveryMessages.product_unavailable}</p>
      {state.error === 'sign_in_again' ? <a className="underline" href={`/sign-in?next=${next}`}>Sign in with GitHub</a> : <>
        <button className={button} disabled={state.refreshing} onClick={() => void state.refresh()}>{state.refreshing ? 'Checking…' : 'Try again'}</button>
        {state.error === 'access_denied' && <a className="ml-4 underline" href={`/sign-in?account=1&next=${next}`}>Check your signed-in account</a>}
        {['permission_required', 'installation_unavailable', 'verification_limit'].includes(state.error) && <p className="mt-4 text-sm"><a className="underline" href="https://github.com/settings/installations">GitHub installation settings</a> · Owners can review installation access here.</p>}
      </>}
    </>}
  </main>
  return <LiveDashboard data={state.data} installationId={installationId} refreshing={state.refreshing}
    refresh={state.refresh} retryImports={state.retryImports} />
}
function LiveDashboard({ data, installationId, refreshing, refresh, retryImports }: {
  data: TeamData; installationId: number; refreshing: boolean; refresh: () => Promise<void>; retryImports: () => Promise<void>
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const { sampledAt, playing, seek: setSampledAt, toggle, canPlay } = useSnapshotReplay(data.season.season.id, data.snapshots)
  const [mobileView, setMobileView] = useState<'track' | 'standings' | 'pit'>('track')
  const frame = adaptFrame(data, sampledAt), historical = frame.snapshot !== null
  const selectedRow = frame.rows.find(p => p.participantId === selected) ?? frame.rows[0]
  const profile = !historical ? data.participants.find(p => p.participantId === selectedRow?.participantId) : null
  const health = data.health.health, current = health.current
  const index = frame.snapshot ? data.snapshots.findIndex(s => s.sampledAt === frame.snapshot!.sampledAt) : data.snapshots.length
  const teamSetup = data.setup
  const drivers = trackDrivers(frame.rows, selectedRow?.participantId)
  const needsAttention = !teamSetup.repositories.length || teamSetup.repositories.some(r => r.status !== 'completed') || !!data.removedRepositoryCount
  const season = data.season.season
  return <main className="team-race" data-view={mobileView}>
    <header className="race-header">
      <div className="min-w-0"><p className="hud-label text-accent race-header-eyebrow">Team championship</p><h1 className="race-team-name">{teamSetup.organization.name}</h1></div>
      <div className="race-season"><span className="hud-label">Season {season.id} · {season.phase === 'final_stage' ? RACING_MANIFEST.vocabulary.finalStage : 'Championship'}</span><span className="sr-only">Ends {new Date(season.endsAt).toLocaleString()}</span><SeasonCountdown endsAt={season.endsAt} onRollover={() => void refresh()} /></div>
      <a className="race-action" href={`/teams/${installationId}/history`}><History size={15} aria-hidden="true" />Season history</a>
    </header>
    <div className="race-mobile-nav" aria-label="Dashboard views">
      <button aria-pressed={mobileView === 'track'} onClick={() => setMobileView('track')}><Flag size={16} aria-hidden="true" />Track</button>
      <button aria-pressed={mobileView === 'standings'} onClick={() => setMobileView('standings')}><Users size={16} aria-hidden="true" />Standings</button>
      <button aria-pressed={mobileView === 'pit'} onClick={() => setMobileView('pit')}><Activity size={16} aria-hidden="true" />Pit wall{needsAttention ? ' · !' : ''}</button>
    </div>
    {needsAttention && <button className="race-attention" onClick={() => { setMobileView('pit'); document.querySelector('.race-right [role="status"]')?.scrollIntoView({ block: 'nearest' }) }}>{teamSetup.repositories.some(r => r.status === 'failed' || r.status === 'cancelled') ? 'Repository import needs attention' : !teamSetup.repositories.length ? 'No repositories connected' : teamSetup.repositories.some(r => r.status !== 'completed') ? 'Importing repository activity' : 'Repository selection changed'} · View pit wall</button>}
    <div className="race-stage">
      <div className="race-track">
        <div className="race-circuit-label">{(season.themePack?.id !== RACING_MANIFEST.id || season.themePack?.version !== RACING_MANIFEST.version) && <p role="status">The current season is updating. Refresh shortly to load its theme.</p>}<span className="hud-label">{historical ? 'Season replay' : 'Live circuit'}</span><p>Jacarepaguá</p></div>
        <div className="race-track-map"><TrackMap circuit={JACAREPAGUA} drivers={drivers} onSelectDriver={setSelected} /></div>
        {selectedRow && <button className="race-mobile-driver" onClick={() => setMobileView('standings')}>{selectedRow.displayName} · {selectedRow.points} pts · View driver</button>}
      </div>
      <aside className="race-left" aria-label="Championship and driver">
      <section className="race-panel" aria-labelledby="standings-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-widest text-accent">{historical ? 'Season replay' : 'Live standings'}</p><h2 id="standings-heading" className="mt-2 text-lg font-semibold">Championship</h2></div>
          <p className="text-right"><strong className="text-3xl">{frame.totalPoints}</strong><span className="block text-xs text-text-faint">team points</span></p></div>
        {historical && <p className="mt-3 text-sm">As of {new Date(frame.snapshot!.sampledAt).toLocaleString()}</p>}
        {!frame.rows.length ? <p className="mt-6 text-text-faint">{historical ? 'No participants had joined at this point in the season.' : !teamSetup.repositories.length ? 'Connect a repository to begin importing your team’s activity.' : teamSetup.repositories.some(r => r.status !== 'completed') ? 'Your roster is still being imported. Check repository setup for progress.' : 'No participants yet. Open a PR or submit a formal review in a connected repository to start building your team roster.'}</p> : <ol className="race-standings">{frame.rows.map(person => <li key={person.participantId}>
          <button className={`flex w-full items-center gap-2 rounded px-2 py-3 text-left sm:gap-3 sm:px-3 race-standing ${person.participantId === selectedRow?.participantId ? 'is-selected' : ''}`}
            style={{ '--driver-color': drivers.find(driver => driver.id === person.participantId)?.color, borderLeftColor: drivers.find(driver => driver.id === person.participantId)?.color } as CSSProperties}
            aria-pressed={person.participantId === selectedRow?.participantId} onClick={() => setSelected(person.participantId)}>
            <span className="w-5 shrink-0 font-mono text-lg text-accent sm:w-8">{person.rank === null ? '—' : `${person.tied ? '=' : ''}${person.rank}`}</span>
            <span className="min-w-0 flex-1"><span className="block break-words font-medium">{person.displayName}</span>
              <span className="block text-xs text-text-faint">{!historical && !person.active ? 'Inactive driver' : person.points === 0 ? RACING_MANIFEST.vocabulary.notStarted : person.points === frame.rows[0]?.points ? (person.tied ? 'Tied lead' : 'Leader') : `${(frame.rows[0]?.points ?? 0) - person.points} pts to lead${person.tied ? ' · Tied' : ''}`}</span></span>
            <span className="shrink-0 font-mono">{person.points} <span className="text-xs text-text-faint">pts</span></span>
          </button></li>)}</ol>}
        {!historical && frame.rows.length > 0 && frame.totalPoints === 0 && <p className="mt-4 text-sm text-text-faint">No points earned yet. Eligible formal reviews on ready PRs earn championship points. See How championship points work for the rules.</p>}
        <p className="mt-5 text-xs text-text-faint">Provisional standings{data.season.pendingPullRequests > 0 ? ` · ${data.season.pendingPullRequests} pull request${data.season.pendingPullRequests === 1 ? '' : 's'} awaiting scoring` : ''}</p>
      </section>
      {selectedRow && <section className="race-panel race-driver" style={{ '--driver-color': drivers.find(driver => driver.id === selectedRow.participantId)?.color } as CSSProperties} aria-label="Selected driver stats">
        <p className="hud-label">Driver</p>
        <div className="mt-4 flex items-center gap-3"><span className="race-driver-rank" style={{ color: drivers.find(driver => driver.id === selectedRow.participantId)?.color }}>{selectedRow.rank ?? '—'}</span><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{selectedRow.displayName}</h2><p className="hud-label">{selectedRow.points} championship pts</p></div></div>
        {profile ? <dl className="race-driver-stats"><div><dt>Current streak</dt><dd>{profile.streak.current}<span> {profile.streak.current === 1 ? 'day' : 'days'}</span></dd></div><div><dt>Season best</dt><dd>{profile.streak.best}<span> {profile.streak.best === 1 ? 'day' : 'days'}</span></dd></div></dl> : <p className="mt-4 text-sm text-text-faint">Driver streaks are available in the live view.</p>}
      </section>}
      </aside>
      <aside className="race-right" aria-label="Pit wall" onClickCapture={event => {
        if ((event.target as HTMLElement).closest('a[href="#repository-setup"]')) event.currentTarget.querySelector('details.race-operations')?.setAttribute('open', '')
      }}>
    <section className="race-panel" aria-labelledby="health-heading"><p className="hud-label mb-2">Pit wall</p><h2 id="health-heading" className="text-xl font-semibold">Review health</h2>
      {historical ? <p className="mt-3 text-text-faint">Review health is available in the live view.</p> : <>

        <dl className="race-health-metrics">
          <Metric label="Qualifying reviews" value={current?.usefulReviews ?? 'Unavailable'} />
          <Metric label="Review participation" value={current?.participation.percentage == null ? 'Unavailable' : `${Math.round(current.participation.percentage)}%`} />
          <Metric label="Waiting over 24 hours" value={health.agingQueue.count} />
          <Metric label="Median first review" value={current?.medianFirstReviewMs == null ? 'Unavailable' : `${Math.round(current.medianFirstReviewMs / 60000)} min`} />
        </dl>
        {health.status === 'partial' && <details className="race-data-status"><summary>{data.health.pendingPullRequests > 0 ? `${data.health.pendingPullRequests} PR${data.health.pendingPullRequests === 1 ? '' : 's'} awaiting scoring` : 'Incomplete timing data'}</summary><p className="mt-2 text-sm text-text-faint">{data.health.pendingPullRequests > 0 ? `${data.health.pendingPullRequests} pull request${data.health.pendingPullRequests === 1 ? '' : 's'} awaiting scoring. These metrics reflect verified activity so far; totals may change once scoring is resolved.` : health.agingQueue.unknownReadinessCount > 0 ? `Readiness timing is unknown for ${health.agingQueue.unknownReadinessCount} pull requests. Timing metrics may be incomplete.` : 'Some historical review timing is unavailable. These metrics reflect verified activity so far.'}</p></details>}
        <details className="race-data-notes"><summary>About review data</summary><p className="mt-3 text-xs text-text-faint">Counted once per reviewer per PR for a qualifying, point-earning approval, approval with feedback, formal comment review with feedback, or changes requested. Extra comments and follow-through bonuses do not add another review.</p>
        {health.baseline === null && <p className="mt-5 text-xs text-text-faint">A verified pre-season baseline is not available yet.</p>}
        {health.agingQueue.unknownReadinessCount > 0 && <p className="mt-2 text-xs text-text-faint">Readiness timing is unknown for {health.agingQueue.unknownReadinessCount} pull requests.</p>}
        </details>
      </>}
    </section>
    <TeamNotice data={data} />
    <details className="race-panel race-operations"><summary className="race-menu-heading"><Settings2 size={16} aria-hidden="true" />Team menu</summary>
    <div className="mt-3 flex flex-wrap gap-3"><button className={button} disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh'}</button><a className="race-action" href="/sign-in?account=1">Switch team</a><a className="race-action" href={`/teams/${installationId}/history`}>Season history</a></div>
    {teamSetup.canManage && <ShareTeamLink installationId={installationId} />}
    <details id="repository-setup" className="mt-4 border-t border-line pt-4"><summary className="cursor-pointer font-semibold">Repository setup · {teamSetup.repositories.filter(r => r.status === 'completed').length} of {teamSetup.repositories.length} imported</summary>
      {!teamSetup.repositories.length && <p className="mt-4">Waiting for selected repositories.</p>}
      <ul className="mt-4 space-y-3 text-sm">{teamSetup.repositories.map(repo => <li key={repo.name} className="flex flex-wrap justify-between gap-2"><strong className="break-all">{repo.name}</strong><span>{repo.status === 'completed' ? 'Imported' : repo.status === 'failed' ? 'Import needs a retry' : repo.status === 'cancelled' ? 'Import stopped' : 'Import in progress'}</span></li>)}</ul>
      {teamSetup.canManage && <div className="mt-4 flex flex-wrap items-center gap-4">
        {teamSetup.repositories.some(r => r.status === 'failed') && <button className={button} disabled={refreshing} onClick={() => void retryImports()}>Retry failed imports</button>}
        <a className="inline-flex min-h-11 items-center text-sm underline" href="https://github.com/settings/installations">GitHub installation settings</a>
      </div>}
    </details>
    <ScoringSummary compact />
    <div className="mt-5 flex gap-4 text-xs text-text-faint"><a href="/privacy" className="underline">Privacy</a><a href="/pilot" className="underline">Help</a></div>
    </details>
    <p className="race-updated">Updates every 15 seconds · Last updated <time dateTime={data.season.generatedAt}>{new Date(data.season.generatedAt).toLocaleTimeString()}</time></p>
    </aside>
    </div>
    <section className="race-transport" aria-labelledby="replay-heading">
      <button className="race-play" aria-label={playing ? 'Pause replay' : 'Play replay'} aria-pressed={playing} disabled={!canPlay} onClick={toggle}>{playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}</button>
      <div className="race-live-state"><Radio size={16} aria-hidden="true" className="text-accent" /><div><h2 id="replay-heading" className="hud-label">Season replay</h2><label className="font-mono text-sm" htmlFor="season-replay">{historical ? new Date(frame.snapshot!.sampledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Live'}</label></div></div>
      <div className="race-scrubber"><div className="race-timeline-labels"><span>{data.snapshots[0] ? `First snapshot · ${new Date(data.snapshots[0].sampledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'No snapshots yet'}</span><span>Live</span></div><input id="season-replay" style={{ '--replay-progress': `${data.snapshots.length ? index / data.snapshots.length * 100 : 0}%` } as CSSProperties} aria-valuetext={historical ? new Date(frame.snapshot!.sampledAt).toLocaleString() : 'Live'} aria-describedby="replay-help" type="range" min="0" max={data.snapshots.length} value={index} step="1"
        disabled={!data.snapshots.length} onChange={event => setSampledAt(data.snapshots[Number(event.target.value)]?.sampledAt ?? null)} /><p id="replay-help" className="text-xs text-text-faint">{data.snapshots.length ? `Recorded snapshots · ${historical ? `${index + 1} of ${data.snapshots.length}` : `${data.snapshots.length} available`}` : 'Playback unlocks after two snapshots'}</p></div>
      <button className={button} disabled={!historical} onClick={() => setSampledAt(null)}>Back to live</button>
    </section>
  </main>
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-xs text-text-faint">{label}</dt><dd className="mt-2 text-xl font-semibold">{value}</dd></div>
}
