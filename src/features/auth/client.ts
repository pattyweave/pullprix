import type { InstallationSetup } from '../setup/types'
import type { ProductQuery } from '../../../supabase/functions/product-api/model'
import { readBrowserSupabaseConfig, type BrowserSupabaseConfig } from '../../lib/supabase/config'
export type Access = { githubUserId: number; login: string; avatarUrl: string | null; organizations: { id: string; name: string; slug: string; installationId?: number | null }[] }
type Session = { accessToken: string; refreshToken: string; expiresAt: number }
const SESSION = 'pullprix.session', VERIFIER = 'pullprix.pkce'
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
export function createAuthClient(config: BrowserSupabaseConfig, storage: Storage, origin: string, fetcher: typeof fetch = fetch) {
  let refreshing: Promise<Session> | null = null
  async function action(body: unknown, token?: string): Promise<Session> {
    const response = await fetcher(`${config.url}/functions/v1/auth-session`, { method: 'POST', headers: {
      apikey: config.publishableKey, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error('Sign-in could not be completed. Please try again.')
    return response.json()
  }
  function saved(): Session | null {
    try { const value = JSON.parse(storage.getItem(SESSION) ?? 'null'); return value && typeof value.accessToken === 'string' && typeof value.refreshToken === 'string' && Number.isFinite(value.expiresAt) ? value : null } catch { return null }
  }
  async function session() {
    const value = saved(); if (!value) return null
    if (value.expiresAt > Date.now() + 60000) return value
    if (!refreshing) refreshing = action({ action: 'refresh', refreshToken: value.refreshToken }).then(next => {
      storage.setItem(SESSION, JSON.stringify(next)); return next
    }).catch(error => { storage.removeItem(SESSION); throw error }).finally(() => { refreshing = null })
    return refreshing
  }
  return {
    async signInUrl() {
      const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
      storage.setItem(VERIFIER, verifier)
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
      const url = new URL(`${config.url}/auth/v1/authorize`)
      url.search = new URLSearchParams({ provider: 'github', redirect_to: `${origin}/auth/callback`, code_challenge: challenge, code_challenge_method: 's256' }).toString()
      return url.toString()
    },
    async finish(code: string) {
      const verifier = storage.getItem(VERIFIER); storage.removeItem(VERIFIER)
      if (!verifier) throw new Error('This sign-in attempt expired. Start again in this tab.')
      const value = await action({ action: 'exchange', code, verifier })
      storage.setItem(SESSION, JSON.stringify(value))
    },
    async access(): Promise<Access | null> {
      const value = await session(); if (!value) return null
      const response = await fetcher(`${config.url}/rest/v1/rpc/get_signed_in_access`, { method: 'POST', headers: {
        apikey: config.publishableKey, authorization: `Bearer ${value.accessToken}`, 'content-type': 'application/json' }, body: '{}' })
      if (!response.ok) { storage.removeItem(SESSION); throw new Error('Your session is no longer authorized. Please sign in again.') }
      return response.json()
    },
    async installationSetup(installationId: number, retry = false): Promise<InstallationSetup> {
      const value = await session()
      if (!value) throw new Error('sign_in_again')
      const response = await fetcher(`${config.url}/functions/v1/installation-setup`, {
        method: 'POST', headers: { apikey: config.publishableKey, authorization: `Bearer ${value.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ installationId, retry }), signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(response.status === 401 ? 'sign_in_again' : error.error ?? 'setup_unavailable')
      }
      return response.json()
    },
    async product(query: Omit<ProductQuery, 'offset' | 'limit'> & { offset?: number; limit?: number }): Promise<unknown> {
      const value = await session()
      if (!value) throw new Error('sign_in_again')
      const url = new URL(`${config.url}/functions/v1/product-api`)
      for (const [key, item] of Object.entries(query)) if (item !== undefined) url.searchParams.set(key, String(item))
      const response = await fetcher(url.toString(), { signal: AbortSignal.timeout(20000), headers: {
        apikey: config.publishableKey, authorization: `Bearer ${value.accessToken}`,
      } })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(response.status === 401 ? 'sign_in_again' : error.error ?? 'product_unavailable')
      }
      return response.json()
    },
    async signOut() {
      try { const value = await session(); if (value) await action({ action: 'logout' }, value.accessToken) }
      finally { storage.removeItem(SESSION); storage.removeItem(VERIFIER) }
    },
  }
}
let client: ReturnType<typeof createAuthClient> | undefined
export function authClient() {
  return client ??= createAuthClient(readBrowserSupabaseConfig(), window.sessionStorage, window.location.origin)
}
