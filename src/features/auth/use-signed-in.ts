import { useSyncExternalStore } from 'react'
import { authClient, SESSION_CHANGED } from './client'

function subscribe(notify: () => void) {
  window.addEventListener(SESSION_CHANGED, notify)
  window.addEventListener('storage', notify)
  return () => {
    window.removeEventListener(SESSION_CHANGED, notify)
    window.removeEventListener('storage', notify)
  }
}
function snapshot() {
  // This controls navigation copy only. Team access is still verified by the API.
  try { return authClient().hasSession() } catch { return false }
}
export function useSignedIn() {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
