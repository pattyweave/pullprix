import { TrackMap } from '../../components/hud/TrackMap'
import { JACAREPAGUA } from '../track/circuits'
import { POINTS_PER_LAP } from '../track/points'
import { trackDrivers } from './track-drivers'
import { Component, useState, type ReactNode } from 'react'
import { useParams } from '@tanstack/react-router'
import { SeasonWelcome } from '../setup/SeasonWelcome'
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
  const [sampledAt, setSampledAt] = useState<string | null>(null), [selected, setSelected] = useState<string | null>(null)
  const frame = adaptFrame(data, sampledAt), historical = frame.snapshot !== null
  const selectedRow = frame.rows.find(p => p.participantId === selected) ?? frame.rows[0]
  const profile = !historical ? data.participants.find(p => p.participantId === selectedRow?.participantId) : null
  const health = data.health.health, current = health.current
  const index = frame.snapshot ? data.snapshots.findIndex(s => s.sampledAt === frame.snapshot!.sampledAt) : data.snapshots.length
  const teamSetup = data.setup
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-full"><p className="font-mono text-xs uppercase tracking-widest text-accent">Team dashboard</p><h1 className="mt-2 break-words text-3xl font-semibold">{teamSetup.organization.name}</h1></div>
      <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh'}</button><a className="inline-flex min-h-11 items-center text-sm underline" href={`/teams/${installationId}/history`}>Season history</a><a className="inline-flex min-h-11 items-center text-sm underline" href="/sign-in">Your account</a><a className="inline-flex min-h-11 items-center text-sm underline" href="/privacy">Privacy</a><a className="inline-flex min-h-11 items-center text-sm underline" href="/pilot">Help</a></div>
    </div>
    <p className="mt-3 text-sm text-text-faint">Updates every 15 seconds · Last updated <time dateTime={data.season.generatedAt}>{new Date(data.season.generatedAt).toLocaleTimeString()}</time></p>
    {teamSetup.canManage && <ShareTeamLink installationId={installationId} />}
    <TeamNotice data={data} />
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="min-w-0"><SeasonWelcome season={data.season.season} onRollover={() => void refresh()} track={<>
        <div className="h-64 sm:h-80"><TrackMap circuit={JACAREPAGUA} drivers={trackDrivers(frame.rows, selectedRow?.participantId)} onSelectDriver={setSelected} /></div>
        <p className="mt-3 text-center text-sm text-text-faint">{historical ? 'Replay' : 'Live'} · {POINTS_PER_LAP} points per lap · Standings show total points</p>
      </>} /></div>
      <section className="mt-6 min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="standings-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-widest text-accent">{historical ? 'Season replay' : 'Live standings'}</p><h2 id="standings-heading" className="mt-2 text-xl font-semibold">Championship</h2></div>
          <p className="text-right"><strong className="text-3xl">{frame.totalPoints}</strong><span className="block text-xs text-text-faint">team points</span></p></div>
        {historical && <p className="mt-3 text-sm">As of {new Date(frame.snapshot!.sampledAt).toLocaleString()}</p>}
        {!frame.rows.length ? <p className="mt-6 text-text-faint">{historical ? 'No participants had joined at this point in the season.' : !teamSetup.repositories.length ? 'Connect a repository to begin importing your team’s activity.' : teamSetup.repositories.some(r => r.status !== 'completed') ? 'Your roster is still being imported. Check repository setup for progress.' : 'No participants yet. Open a PR or submit a formal review in a connected repository to start building your team roster.'}</p> : <ol className="mt-5 divide-y divide-line">{frame.rows.map(person => <li key={person.participantId}>
          <button className={`flex w-full items-center gap-2 rounded px-2 py-3 text-left sm:gap-3 sm:px-3 ${person.participantId === selectedRow?.participantId ? 'bg-accent/10' : 'hover:bg-background'}`}
            aria-pressed={person.participantId === selectedRow?.participantId} onClick={() => setSelected(person.participantId)}>
            <span className="w-5 shrink-0 font-mono text-lg text-accent sm:w-8">{person.rank === null ? '—' : `${person.tied ? '=' : ''}${person.rank}`}</span>
            {person.avatarUrl && <img src={person.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full" />}
            <span className="min-w-0 flex-1"><span className="block break-words font-medium">{person.displayName}</span>
              <span className="block text-xs text-text-faint">{!historical && !person.active ? 'Inactive driver' : person.points === 0 ? RACING_MANIFEST.vocabulary.notStarted : person.tied ? 'Tied position' : 'Championship driver'}</span></span>
            <span className="shrink-0 font-mono">{person.points} <span className="text-xs text-text-faint">pts</span></span>
          </button></li>)}</ol>}
        {!historical && frame.rows.length > 0 && frame.totalPoints === 0 && <p className="mt-4 text-sm text-text-faint">No points earned yet. Eligible formal reviews on ready PRs earn championship points. See How championship points work for the rules.</p>}
        {profile && <div className="mt-5 break-words border-t border-line pt-4" aria-label="Selected driver stats"><h3 className="font-semibold">{profile.displayName}</h3>
          <p className="mt-2 text-sm text-text-faint">Review streak · {profile.streak.current} current / {profile.streak.best} best days this season</p></div>}
        <p className="mt-5 text-xs text-text-faint">Provisional standings{data.season.pendingPullRequests > 0 ? ` · ${data.season.pendingPullRequests} pull request${data.season.pendingPullRequests === 1 ? '' : 's'} awaiting scoring` : ''}</p>
      </section>
    </div>
    <section className="mt-6 rounded-xl border border-line p-5" aria-labelledby="replay-heading">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="replay-heading" className="text-xl font-semibold">Season replay</h2><button className={button} disabled={!historical} onClick={() => setSampledAt(null)}>Back to live</button></div>
      <p className="mt-2 text-sm text-text-faint">Daily points history, updated when scoring is corrected.</p>
      <label className="mt-4 block text-sm" htmlFor="season-replay">{historical ? new Date(frame.snapshot!.sampledAt).toLocaleString() : 'Live'}</label>
      <input id="season-replay" className="mt-3 h-11 w-full accent-accent" type="range" min="0" max={data.snapshots.length} value={index} step="1"
        disabled={!data.snapshots.length} onChange={event => setSampledAt(data.snapshots[Number(event.target.value)]?.sampledAt ?? null)} />
    </section>
    <section className="mt-6 rounded-xl border border-line bg-surface p-5" aria-labelledby="health-heading"><h2 id="health-heading" className="text-xl font-semibold">Review health</h2>
      {historical ? <p className="mt-3 text-text-faint">Review health is available in the live view.</p> : <>
        <p className="mt-2 text-sm text-text-faint">{health.status === 'partial' ? 'Some review data is still incomplete. These metrics reflect verified activity so far; check repository setup or refresh shortly.' : 'Based on verified review activity.'}</p>
        <dl className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Metric label="Useful reviews" value={current?.usefulReviews ?? 'Unavailable'} />
          <Metric label="Review participation" value={current?.participation.percentage == null ? 'Unavailable' : `${Math.round(current.participation.percentage)}%`} />
          <Metric label="Waiting over 24 hours" value={health.agingQueue.count} />
          <Metric label="Median first review" value={current?.medianFirstReviewMs == null ? 'Unavailable' : `${Math.round(current.medianFirstReviewMs / 60000)} min`} />
        </dl>
        {health.baseline === null && <p className="mt-5 text-xs text-text-faint">A verified pre-season baseline is not available yet.</p>}
        {health.agingQueue.unknownReadinessCount > 0 && <p className="mt-2 text-xs text-text-faint">Readiness timing is unknown for {health.agingQueue.unknownReadinessCount} pull requests.</p>}
      </>}
    </section>
    <details id="repository-setup" className="mt-6 rounded-xl border border-line p-5"><summary className="cursor-pointer font-semibold">Repository setup · {teamSetup.repositories.filter(r => r.status === 'completed').length} of {teamSetup.repositories.length} imported</summary>
      {!teamSetup.repositories.length && <p className="mt-4">Waiting for selected repositories.</p>}
      <ul className="mt-4 space-y-3 text-sm">{teamSetup.repositories.map(repo => <li key={repo.name} className="flex flex-wrap justify-between gap-2"><strong className="break-all">{repo.name}</strong><span>{repo.status === 'completed' ? 'Imported' : repo.status === 'failed' ? 'Import needs a retry' : repo.status === 'cancelled' ? 'Import stopped' : 'Import in progress'}</span></li>)}</ul>
      {teamSetup.canManage && <div className="mt-4 flex flex-wrap items-center gap-4">
        {teamSetup.repositories.some(r => r.status === 'failed') && <button className={button} disabled={refreshing} onClick={() => void retryImports()}>Retry failed imports</button>}
        <a className="inline-flex min-h-11 items-center text-sm underline" href="https://github.com/settings/installations">GitHub installation settings</a>
      </div>}
    </details>
  </main>
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-xs text-text-faint">{label}</dt><dd className="mt-2 text-xl font-semibold">{value}</dd></div>
}
