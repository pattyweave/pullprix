import { useEffect, useState } from 'react'
import { authClient } from '../auth/client'
import type { InstallationSetup } from './types'
import { TeamRoster } from './TeamRoster'
import { SeasonWelcome } from './SeasonWelcome'
import { ShareTeamLink } from './ShareTeamLink'
const messages: Record<string, string> = {
  permission_required: 'The GitHub App needs Members read-only access. Ask an organization owner to approve the updated app permissions, then try again.',
  access_denied: 'This GitHub account does not have access to this team. Use an active organization member account or an account with collaborator access to a selected repository.',
  installation_unavailable: 'This installation is unavailable or suspended. Check its settings in GitHub, then try again.',
  administrator_required: 'Only an organization owner or installation owner can retry imports. Your team access is still available.',
  verification_limit: 'We couldn’t finish checking repository access. Please contact your organization owner.',
  github_busy: 'GitHub is limiting requests. Please try again in a few minutes.',
  sign_in_again: 'Sign in with GitHub to view this team.',
}
export function InstallationPage() {
  const callback = window.location.pathname === '/installations/callback'
  const rawId = callback ? new URLSearchParams(window.location.search).get('installation_id') : window.location.pathname.split('/')[2]
  const installationId = rawId && /^[1-9][0-9]*$/.test(rawId) ? Number(rawId) : NaN
  const valid = Number.isSafeInteger(installationId) && installationId > 0
  const [data, setData] = useState<InstallationSetup | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [request, setRequest] = useState({ revision: 0, retry: false })
  useEffect(() => {
    let active = true
    if (!valid) { setError('invalid_installation'); setBusy(false); return }
    setBusy(true); setError(''); setData(null)
    void authClient().installationSetup(installationId, request.retry).then(result => {
      if (!active) return
      if (callback && result.setup.status === 'ready') { window.location.replace(`/teams/${installationId}`); return }
      setData(result)
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'setup_unavailable') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [installationId, valid, callback, request])
  const refresh = (retry = false) => setRequest(value => ({ revision: value.revision + 1, retry }))
  const next = callback ? `/installations/callback?installation_id=${installationId}` : `/teams/${installationId}`
  const setup = data?.setup
  return <main className="mx-auto max-w-2xl px-6 py-16">
    <h1 className="text-3xl font-semibold">{setup?.status === 'ready' ? `${setup.organization.name} · Current season` : 'Connect your team'}</h1>
    {busy && <p role="status" className="mt-6">Checking your GitHub access…</p>}
    {error && <p role="alert" className="mt-6">{error === 'invalid_installation' ? 'This installation link is incomplete. Return from the GitHub App installation settings.' : messages[error] ?? 'We couldn’t load your team. Please try again.'}</p>}
    {!busy && error === 'sign_in_again' && <a className="mt-6 inline-block underline" href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in with GitHub</a>}
    {!busy && valid && error && error !== 'sign_in_again' && <button className="mt-6 rounded border border-line px-4 py-2" onClick={() => refresh()}>Try again</button>}
    {setup?.status === 'waiting_for_webhook' && <p className="mt-6">GitHub has confirmed your access. We’re waiting for the installation to arrive. Check again shortly.</p>}
    {!busy && error === 'access_denied' && <p className="mt-4 text-sm">
      <a className="underline" href={`/sign-in?account=1&next=${encodeURIComponent(next)}`}>Check your signed-in account</a>, or ask an organization owner to confirm your GitHub access.
    </p>}
    {data && setup?.status === 'ready' && <>
      {setup.canManage && <ShareTeamLink installationId={installationId} />}
      <SeasonWelcome season={data.season} onRollover={() => refresh()} />
      <TeamRoster participants={setup.roster ?? []} importing={!setup.repositories.length || setup.repositories.some(repo => repo.status !== 'completed')} />
      <h2 className="mt-8 text-xl font-semibold">Repository setup</h2>
      {!setup.repositories.length ? <p className="mt-3">Waiting for selected repositories. Check your GitHub App repository selection if none appear.</p> : <>
        <p className="mt-3">{setup.repositories.filter(r => r.status === 'completed').length} of {setup.repositories.length} repositories imported.</p>
        {setup.repositories.some(r => r.status !== 'completed') && <p className="mt-3">Historical activity is still being prepared. Your team can enter the season while the import continues.</p>}
        <ul className="mt-4 space-y-3">{setup.repositories.map(repo => <li key={repo.name} className="rounded border border-line p-4"><strong>{repo.name}</strong><span className="ml-3">{repo.status === 'completed' ? 'Imported' : repo.status === 'failed' ? 'Import needs a retry' : repo.status === 'cancelled' ? 'Import stopped' : 'Import in progress'}</span></li>)}</ul>
        {setup.canManage && setup.repositories.some(r => r.status === 'failed') && <button className="mt-6 rounded border border-line px-4 py-2" onClick={() => refresh(true)}>Retry failed imports</button>}
      </>}
      <p className="mt-6 text-text-faint">Standings are not available on this setup page yet.</p>
    </>}
    {data && !busy && <button className="mt-6 rounded border border-line px-4 py-2" onClick={() => refresh()}>Refresh status</button>}
    <p className="mt-8">{(!setup || (setup.status === 'ready' && setup.canManage)) && <><a className="underline" href="https://github.com/settings/installations">GitHub installation settings</a> · </>}<a className="underline" href="/sign-in">Your account</a></p>
    <p className="mt-6 text-sm text-text-faint"><a className="underline" href="/privacy">Privacy and deletion</a> · <a className="underline" href="/terms">Pilot terms</a></p>
  </main>
}
