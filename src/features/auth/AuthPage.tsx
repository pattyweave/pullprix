import { useEffect, useState } from 'react'
import { authClient, type Access } from './client'
import { rememberSetupReturn, takeSetupReturn } from '../setup/return-path'

// Keep the callback exchange single-flight across development StrictMode mounts.
let callback: Promise<void> | undefined
export function AuthPage() {
  const [access, setAccess] = useState<Access | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    async function load() {
      const client = authClient(), params = new URLSearchParams(window.location.search)
      if (window.location.pathname === '/auth/callback') {
        const code = params.get('code')
        if (params.has('error') || (!code && !callback)) throw new Error('GitHub sign-in was cancelled or could not be completed.')
        if (!callback && code) { callback = client.finish(code); window.history.replaceState({}, '', '/auth/callback') }
        await callback
        window.history.replaceState({}, '', '/sign-in')
      }
      const result = await client.access()
      if (result) {
        rememberSetupReturn(params.get('next'))
        const next = params.get('account') === '1' ? null : takeSetupReturn()
        if (next) { window.location.replace(next); return }
      }
      if (active) setAccess(result)
    }
    void load().catch(e => { if (active) setError(e instanceof Error ? e.message : 'Sign-in unavailable.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function signIn() {
    setLoading(true); setError('')
    rememberSetupReturn(new URLSearchParams(window.location.search).get('next'))
    try { window.location.assign(await authClient().signInUrl()) }
    catch { setError('Sign-in is not configured yet. Please try again later.'); setLoading(false) }
  }
  async function signOut() {
    setLoading(true); setError('')
    try { await authClient().signOut() }
    catch { setError('Signed out of this tab. The server could not confirm revocation; retry sign-in if needed.') }
    finally { setAccess(null); setLoading(false) }
  }
  return <main className="mx-auto max-w-xl px-6 py-16">
    <h1 className="text-3xl font-semibold">{access ? 'Your Pull Prix teams' : 'Sign in to Pull Prix'}</h1>
    <p className="mt-4 text-text-faint">{access ? `Signed in as ${access.login}.` : 'Use your GitHub account to access your private team.'}</p>
    {access && new URLSearchParams(window.location.search).get('account') === '1' && <p className="mt-4 text-sm">If this is the wrong account, sign out here and use the intended GitHub account when signing in again.</p>}
    {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
    {loading ? <p role="status" className="mt-6">Checking your session…</p> : access ? <>
      {access.organizations.length ? <ul className="mt-6 space-y-3">{access.organizations.map(o => <li key={o.id} className="rounded border border-line p-4">{o.installationId ? <a className="underline" href={`/teams/${o.installationId}`}>{o.name}</a> : o.name}</li>)}</ul> :
        <p className="mt-6">You’re signed in, but no team has granted this account access yet.</p>}
      <button className="mt-6 rounded border border-line px-4 py-2" onClick={() => void signOut()}>Sign out</button>
    </> : <button className="mt-6 rounded bg-accent px-4 py-2 text-background" onClick={() => void signIn()}>Continue with GitHub</button>}
    <p className="mt-8 text-sm text-text-faint">By continuing, you agree to the <a className="underline" href="/terms">pilot terms</a>. Read our <a className="underline" href="/privacy">privacy policy</a> for data use and deletion.</p>
    <p className="mt-4 text-sm"><a className="underline" href="/pilot">Pilot setup and support</a></p>
  </main>
}
