// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createAuthClient } from './client'
import { useSignedIn } from './use-signed-in'
const holder = vi.hoisted(() => ({ client: null as ReturnType<typeof createAuthClient> | null }))
vi.mock('./client', async importOriginal => ({
  ...await importOriginal<typeof import('./client')>(),
  authClient: () => holder.client,
}))
afterEach(() => { cleanup(); sessionStorage.clear() })
it('updates navigation after OAuth, sign-out, and invalid session rejection', async () => {
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600000 }))
  const client = createAuthClient({ url: 'https://example.test', publishableKey: 'test' }, sessionStorage, 'https://app.test', fetcher)
  holder.client = client
  const { result } = renderHook(() => useSignedIn())
  expect(result.current).toBe(false)
  sessionStorage.setItem('pullprix.pkce', 'verifier')
  await act(() => client.finish('code'))
  expect(result.current).toBe(true)
  await act(() => client.signOut())
  expect(result.current).toBe(false)
  sessionStorage.setItem('pullprix.pkce', 'verifier')
  await act(() => client.finish('code'))
  expect(result.current).toBe(true)
  fetcher.mockResolvedValue(new Response(null, { status: 401 }))
  await act(async () => { await expect(client.access()).rejects.toThrow('no longer authorized') })
  expect(result.current).toBe(false)
})
