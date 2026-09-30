import { useState } from 'react'
import { isLocalTeamLink, teamEntryUrl } from './team-link'
export function ShareTeamLink({ installationId }: { installationId: number }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const link = teamEntryUrl(window.location.origin, installationId)
  async function copy() {
    try { await navigator.clipboard.writeText(link); setStatus('copied') }
    catch { setStatus('manual') }
  }
  return <div className="mt-4">
    <button className="rounded border border-line px-4 py-2 text-sm" onClick={() => void copy()}>Copy team link</button>
    {status !== 'idle' && <div className="mt-3">
      <p role="status" className="text-sm">{status === 'copied' ? 'Team link copied. GitHub sign-in and team access are required.' : 'Copy this link. GitHub sign-in and team access are required.'}</p>
      <input aria-label="Team link" readOnly value={link} onFocus={event => event.currentTarget.select()} className="mt-2 w-full rounded border border-line bg-transparent px-3 py-2 font-mono text-xs" />
      {isLocalTeamLink(link) && <p className="mt-2 text-sm text-text-faint">This local link works on this computer. Open the deployed app to copy a link your teammates can use.</p>}
    </div>}
  </div>
}
