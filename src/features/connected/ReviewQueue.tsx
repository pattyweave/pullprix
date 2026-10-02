import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { authClient } from '../auth/client'
import type { QueueItem } from '../../../supabase/functions/product-api/review-queue'
import { readQueue, type ReviewQueueData } from './review-queue-data'
const reason = (item: QueueItem) => item.conflict === 'author' ? 'Your PR' : item.conflict === 'reviewed' ? 'You’ve reviewed this' : item.reason === 'required' ? 'Review required' : 'Awaiting first review'
export function ReviewQueueView({ data, loading, retry }: { data: ReviewQueueData | null; loading: boolean; retry: () => void }) {
  const [shown, setShown] = useState(5)
  const next = data?.items.find(item => item.id === data.nextId)
  return <section className="race-panel race-review-queue" data-attention={!loading && (!data || data.status === 'partial') || undefined} aria-labelledby="queue-heading">
    <div className="race-queue-heading"><h2 id="queue-heading" className="hud-label">Up next</h2><span className="hud-label text-accent">Live</span></div>
    {!data ? <p className="mt-3 text-sm text-text-faint">{loading ? 'Checking review queue…' : <>Review queue unavailable. <button className="underline min-h-11" onClick={retry}>Try again</button></>}</p> : <>
      {next ? <a className="race-next-pr" href={next.url} target="_blank" rel="noopener noreferrer">
        <span className="race-pr-reference">{next.repository} #{next.number}<ArrowUpRight size={14} aria-hidden="true" /></span>
        <strong>{next.title}</strong><span className="text-xs text-text-faint">{reason(next)}</span>
      </a> : <p className="mt-3 text-sm text-text-faint">{data.status === 'partial' ? 'No suggestion in the verified results.' : data.items.length ? 'No new review for you right now. You can still browse the team queue below.' : 'All clear. No PRs needing review in repositories you can access.'}</p>}
      {data.items.length > 0 && <details className="race-queue-list"><summary>{data.items.length}{data.status === 'partial' ? '+' : ''} PR{data.items.length === 1 ? '' : 's'} needing review</summary>
        <ol>{data.items.slice(0, shown).map(item => <li key={item.id}><a href={item.url} target="_blank" rel="noopener noreferrer">
          <span className="race-pr-reference">{item.repository} #{item.number}<ArrowUpRight size={14} aria-hidden="true" /></span>
          <span className="block font-medium">{item.title}</span><span className="text-xs text-text-faint">{reason(item)}</span>
        </a></li>)}</ol>
        {shown < data.items.length && <button className="race-action min-h-11" onClick={() => setShown(count => count + 5)}>Show more ({data.items.length - shown})</button>}
      </details>}
      {data.status === 'partial' && <p className="mt-3 text-xs text-text-faint">Some review data couldn’t be checked. This queue may be incomplete.</p>}
      <details className="race-data-notes"><summary>About this queue</summary><p className="mt-2 text-xs text-text-faint">Oldest open PRs first, excluding drafts and work waiting for author changes. Includes GitHub-required reviews and PRs awaiting their first formal human review. Only repositories you can access appear. Your own and previously reviewed PRs stay in the list, but aren’t suggested to you. Reviews may not earn points.</p><p className="mt-2 text-xs text-text-faint">Checked every minute while this page is visible. Last checked {new Date(data.generatedAt).toLocaleTimeString()}. Links open GitHub in a new tab.</p></details>
    </>}
  </section>
}
export function ReviewQueue({ installationId, organizationId }: { installationId: number; organizationId: string }) {
  const [state, setState] = useState<{ data: ReviewQueueData | null; loading: boolean }>({ data: null, loading: true })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true, busy = false, denied = false
    setState({ data: null, loading: true })
    async function load() {
      if (busy || denied || document.visibilityState === 'hidden') return
      busy = true
      try {
        const result = readQueue(await authClient().product({ installationId, resource: 'review-queue' }), organizationId)
        if (alive) setState({ data: result, loading: false })
      } catch (error) {
        denied = error instanceof Error && ['access_denied', 'sign_in_again'].includes(error.message)
        if (alive) setState({ data: null, loading: false })
      } finally { busy = false }
    }
    void load()
    const interval = window.setInterval(() => void load(), 60000)
    const visible = () => { if (!denied && document.visibilityState === 'visible') { setState({ data: null, loading: true }); void load() } }
    document.addEventListener('visibilitychange', visible)
    return () => { alive = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', visible) }
  }, [installationId, organizationId, attempt])
  return <ReviewQueueView data={state.data} loading={state.loading} retry={() => setAttempt(value => value + 1)} />
}
