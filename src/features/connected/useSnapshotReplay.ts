import { useEffect, useState } from 'react'
import type { Snapshot } from './types'

export const REPLAY_STEP_MS = 1500
/** Play recorded samples, never interpolated scores. Freeze the sequence until playback stops. */
export function useSnapshotReplay(seasonId: string, snapshots: Snapshot[]) {
  const [state, setState] = useState<{ seasonId: string; at: string | null; timeline: string[]; playing: boolean }>({ seasonId, at: null, timeline: [], playing: false })
  const valid = state.seasonId === seasonId && (state.at === null || snapshots.some(s => s.sampledAt === state.at))
  const sampledAt = valid ? state.at : null
  const playing = valid && state.playing
  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => setState(previous => {
      const index = previous.timeline.indexOf(previous.at!)
      const next = previous.timeline[index + 1]
      return next ? { ...previous, at: next, playing: index + 1 < previous.timeline.length - 1 } : { ...previous, playing: false }
    }), REPLAY_STEP_MS)
    return () => window.clearTimeout(timer)
  }, [playing, sampledAt])
  useEffect(() => {
    const pause = () => { if (document.visibilityState === 'hidden') setState(previous => ({ ...previous, playing: false })) }
    document.addEventListener('visibilitychange', pause)
    return () => document.removeEventListener('visibilitychange', pause)
  }, [])
  function seek(at: string | null) { setState({ seasonId, at, timeline: [], playing: false }) }
  function toggle() {
    if (playing) { setState(previous => ({ ...previous, playing: false })); return }
    if (snapshots.length < 2) return
    const timeline = snapshots.map(s => s.sampledAt)
    const index = sampledAt ? timeline.indexOf(sampledAt) : -1
    setState({ seasonId, timeline, at: index >= 0 && index < timeline.length - 1 ? sampledAt : timeline[0]!, playing: true })
  }
  return { sampledAt, playing, seek, toggle, canPlay: snapshots.length > 1 }
}
