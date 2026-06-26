import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import { generateTimeline } from './generateTimeline'
import { clampDay, sampleDay } from './engine'
import type { DaySnapshot, SeasonTimeline } from './types'

/**
 * Owns the replay clock and exposes the current season state. The clock is the
 * single source of truth for time; every component reads the snapshot it
 * produces, so "the timeline changes → everything updates" is automatic.
 *
 * Speed is expressed in days/second. Playing advances the cursor continuously
 * via rAF (smooth), so track markers interpolate between days as it ticks.
 */

interface ReplayContextValue {
  timeline: SeasonTimeline
  /** Fractional day cursor (1..totalDays). */
  day: number
  /** The whole-day index currently in view (rounded). */
  currentDay: number
  totalDays: number
  playing: boolean
  /** Season state sampled at the current cursor. */
  snapshot: DaySnapshot
  play: () => void
  pause: () => void
  toggle: () => void
  /** Jump the cursor (e.g. from the slider). Pauses implicitly when scrubbing. */
  setDay: (day: number) => void
}

const ReplayContext = createContext<ReplayContextValue | null>(null)

/** Days advanced per real second while playing. */
const DAYS_PER_SECOND = 1

interface ReplayProviderProps {
  children: ReactNode
  /** Start playing on mount (e.g. the marketing-hero preview). */
  autoPlay?: boolean
  /** Restart from day 1 at the end instead of stopping (looping preview). */
  loop?: boolean
}

export function ReplayProvider({
  children,
  autoPlay = false,
  loop = false,
}: ReplayProviderProps) {
  // Built once. Swap generateTimeline for a real-data loader to go live.
  const timeline = useMemo(() => generateTimeline(35), [])

  const [day, setDayState] = useState(1)
  const [playing, setPlaying] = useState(autoPlay)

  // rAF loop drives the cursor while playing.
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const dayRef = useRef(day)
  dayRef.current = day

  useEffect(() => {
    if (!playing) return

    const tick = (ts: number) => {
      if (lastTsRef.current != null) {
        const elapsed = (ts - lastTsRef.current) / 1000
        const next = dayRef.current + elapsed * DAYS_PER_SECOND
        if (next >= timeline.totalDays) {
          if (loop) {
            setDayState(1)
          } else {
            setDayState(timeline.totalDays)
            setPlaying(false)
            return
          }
        } else {
          setDayState(next)
        }
      }
      lastTsRef.current = ts
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      lastTsRef.current = null
    }
  }, [playing, loop, timeline.totalDays])

  const play = useCallback(() => {
    // Restart from the beginning if we're parked at the end.
    setDayState((d) => (d >= timeline.totalDays ? 1 : d))
    setPlaying(true)
  }, [timeline.totalDays])

  const pause = useCallback(() => setPlaying(false), [])
  const toggle = useCallback(
    () => (playing ? pause() : play()),
    [playing, pause, play],
  )

  const setDay = useCallback(
    (d: number) => {
      setPlaying(false)
      setDayState(clampDay(timeline, d))
    },
    [timeline],
  )

  const snapshot = useMemo(() => sampleDay(timeline, day), [timeline, day])

  const value = useMemo<ReplayContextValue>(
    () => ({
      timeline,
      day,
      currentDay: Math.round(day),
      totalDays: timeline.totalDays,
      playing,
      snapshot,
      play,
      pause,
      toggle,
      setDay,
    }),
    [timeline, day, playing, snapshot, play, pause, toggle, setDay],
  )

  return (
    <ReplayContext.Provider value={value}>{children}</ReplayContext.Provider>
  )
}

export function useReplay(): ReplayContextValue {
  const ctx = useContext(ReplayContext)
  if (!ctx) throw new Error('useReplay must be used within a ReplayProvider')
  return ctx
}
