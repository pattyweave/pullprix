import { useEffect, useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { authClient } from '../auth/client'
import type { buildSeasonResult } from '../../../supabase/functions/process-jobs/season-finalization'
import { recoveryMessages } from './recovery-messages'
type Result = ReturnType<typeof buildSeasonResult>
type Entry = { seasonId: string; status: 'completed' | 'finalizing' }
type History = { contractVersion: string; organizationId: string; items: Entry[]; nextOffset: number | null }
type Archive = { contractVersion: string; organizationId: string; seasonId: string; status: string; snapshot: Result | null }
const button = 'rounded border border-line px-3 py-2 text-sm disabled:opacity-50'
export function SeasonHistoryRoute() {
  const { installationId } = useParams({ from: '/teams/$installationId/history' })
  return <SeasonHistory key={installationId} installationId={Number(installationId)} />
}
export function SeasonHistory({ installationId }: { installationId: number }) {
  const [history, setHistory] = useState<History | null>(null), [archive, setArchive] = useState<Archive | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(true), [request, setRequest] = useState<{ seasonId?: string; offset: number; revision: number }>({ offset: 0, revision: 0 })
  const revision = useRef(0)
  useEffect(() => {
    const current = ++revision.current; let active = true
    setBusy(true); setError(''); setArchive(null)
    async function load() {
      if (!Number.isSafeInteger(installationId) || installationId < 1) throw new Error('access_denied')
      const client = authClient(), setup = await client.installationSetup(installationId)
      if (setup.setup.status !== 'ready') throw new Error('waiting_for_webhook')
      const raw = await client.product({ installationId, resource: request.seasonId ? 'archive' : 'seasons',
        seasonId: request.seasonId, offset: request.offset, limit: 20 }) as History | Archive
      if (raw.contractVersion !== '1' || raw.organizationId !== setup.setup.organization.id) throw new Error('invalid_product_data')
      if (!active || current !== revision.current) return
      if ('items' in raw) {
        if (!Array.isArray(raw.items)) throw new Error('invalid_product_data')
        setHistory(previous => ({ ...raw, items: request.offset && previous ? [...previous.items, ...raw.items] : raw.items }))
      } else {
        if (raw.seasonId !== request.seasonId || (raw.status === 'completed' && (!raw.snapshot || raw.snapshot.organizationId !== raw.organizationId || raw.snapshot.seasonId !== raw.seasonId))) throw new Error('invalid_product_data')
        setArchive(raw)
      }
    }
    void load().catch(reason => { if (active) { setHistory(null); setArchive(null); setError(reason instanceof Error ? reason.message : 'product_unavailable') } })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [installationId, request])
  const refresh = () => setRequest(value => ({ ...value, offset: 0, revision: value.revision + 1 }))
  return <main className="mx-auto max-w-3xl px-6 py-10">
    <a className="text-sm underline" href={`/teams/${installationId}`}>Back to current season</a>
    <h1 className="mt-5 text-3xl font-semibold">Season history</h1>
    {busy && <p role="status" className="mt-6">Loading season history…</p>}
    {error && <div className="mt-6"><p role="alert">{recoveryMessages[error] ?? (error === 'season_not_found' ? 'This season is not available in your team history.' : 'Season history is temporarily unavailable.')}</p>
      <button className={`${button} mt-4`} onClick={refresh}>Try again</button><a className="ml-4 underline" href={`/sign-in?next=${encodeURIComponent(`/teams/${installationId}`)}`}>Your account</a></div>}
    {!busy && !error && history && !archive && <>
      {!history.items.length ? <p className="mt-6 text-text-faint">Your first season is still underway. Results will appear here after it ends.</p> : <ul className="mt-6 space-y-3">{history.items.map(entry => <li key={entry.seasonId}>
        <button className="flex w-full justify-between rounded border border-line p-4 text-left" onClick={() => setRequest({ seasonId: entry.seasonId, offset: 0, revision: 0 })}><span>Season {entry.seasonId}</span><span className="text-text-faint">{entry.status === 'completed' ? 'Completed' : 'Finalizing'}</span></button>
      </li>)}</ul>}
      {history.nextOffset !== null && <button className={`${button} mt-4`} onClick={() => setRequest({ offset: history.nextOffset!, revision: 0 })}>Load older seasons</button>}
    </>}
    {!busy && archive && <section className="mt-6 rounded-xl border border-line p-5">
      <h2 className="text-xl font-semibold">Season {archive.seasonId}</h2>
      {archive.status !== 'completed' || !archive.snapshot ? <><p className="mt-3">Results are still finalizing while delayed activity and scoring checks finish. Your next season is already available.</p><button className={`${button} mt-4`} onClick={refresh}>Check results again</button></> : <>
        <p className="mt-2 text-text-faint">Completed · {archive.snapshot.totalPoints} team points</p>
        <p className="mt-2 text-sm text-text-faint">Results saved at finalization · {archive.snapshot.definition.name} · Scoring {archive.snapshot.definition.scoringPolicyVersion}</p>
        {!archive.snapshot.participants.length ? <p className="mt-5">No qualifying participants in this season.</p> : <ol className="mt-5 divide-y divide-line">{archive.snapshot.participants.map(p => <li key={p.participantId} className="flex flex-wrap justify-between gap-3 py-3"><span>{p.rank === null ? '—' : p.rank} · {p.displayName}{p.champion ? ` · ${p.coChampion ? 'Co-Champion' : 'Champion'}` : ''}</span><span className="font-mono">{p.points} pts</span></li>)}</ol>}
      </>}
      <button className={`${button} mt-5`} onClick={() => setRequest({ offset: 0, revision: 0 })}>All seasons</button>
    </section>}
  </main>
}
