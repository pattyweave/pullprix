import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authClient } from '../auth/client'
import { createTeamLoader, REFRESH_MS } from './loader'
import type { TeamState } from './types'
/** Lifetime matches the keyed team page; no cached data can survive a team/account change. */
export function useTeamData(installationId: number) {
  const loader = useMemo(() => createTeamLoader(authClient(), installationId), [installationId])
  const [state, setState] = useState<TeamState>({ data: null, loading: true, error: '', refreshing: false })
  const alive = useRef(false), busy = useRef(false), generation = useRef(0)
  const autoRetryAt = useRef(0)
  const refresh = useCallback(async (clear = false, retry = false, freshSnapshots = false) => {
    if (busy.current || !alive.current) return
    busy.current = true
    const current = generation.current
    setState(previous => ({ ...previous, ...(clear ? { data: null, loading: true } : {}), refreshing: true }))
    try {
      const data = await (retry ? loader.retryImports() : loader.load(freshSnapshots))
      if (alive.current && current === generation.current) {
        autoRetryAt.current = 0
        setState({ data, loading: false, refreshing: false, error: '' })
      }
    } catch (error) {
      if (alive.current && current === generation.current) {
        const reason = error instanceof Error ? error.message : 'product_unavailable'
        autoRetryAt.current = ['access_denied', 'sign_in_again', 'permission_required', 'installation_unavailable', 'verification_limit'].includes(reason)
          ? Infinity : reason === 'github_busy' ? Date.now() + 60000 : 0
        setState({ data: null, loading: false, refreshing: false, error: reason })
      }
    } finally { if (current === generation.current) busy.current = false }
  }, [loader])
  useEffect(() => {
    alive.current = true; busy.current = false; generation.current++
    void refresh(true)
    const visible = () => { if (document.visibilityState === 'visible') void refresh(true) }
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible' && Date.now() >= autoRetryAt.current) void refresh() }, REFRESH_MS)
    window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible)
    return () => {
      alive.current = false; busy.current = false
      window.clearInterval(interval); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible)
    }
  }, [refresh])
  return { ...state, refresh: () => refresh(false, false, true), retryImports: () => refresh(false, true) }
}
