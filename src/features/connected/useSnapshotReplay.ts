import { useState } from 'react'
import type { Snapshot } from './types'
/** Manual history selection only; missing samples and new seasons return to Live. */
export function useSnapshotReplay(seasonId: string, snapshots: Snapshot[]) {
  const [state, setState] = useState<{ seasonId: string; at: string | null }>({ seasonId, at: null })
  const valid = state.seasonId === seasonId && (state.at === null || snapshots.some(s => s.sampledAt === state.at))
  const sampledAt = valid ? state.at : null
  function seek(at: string | null) { setState({ seasonId, at }) }
  return { sampledAt, seek }
}
