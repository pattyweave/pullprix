import type { DriverStanding, ReviewHealth } from '@/features/season'

/**
 * The replay system models a season as a sequence of per-day snapshots. The
 * engine reads from a {@link SeasonTimeline} — a fully pre-computed dataset —
 * so the data *source* (mock generator today, GitHub-derived tomorrow) is the
 * only thing that ever changes. Everything downstream consumes snapshots.
 */

/** One driver's position on the track for a given day. */
export interface TrackPosition {
  driverId: string
  /** Lap progress 0..1 — how far around the circuit the marker sits. */
  progress: number
}

/** A complete, self-contained view of the season on a single day. */
export interface DaySnapshot {
  /** 1-based day index within the season. */
  day: number
  /** Standings as of this day, already sorted by position. */
  standings: DriverStanding[]
  /** Track marker positions for this day. */
  positions: TrackPosition[]
  /** Race Control / review-health metrics for this day. */
  health: ReviewHealth
}

/**
 * The full pre-computed season. Index `i` of `days` is day `i + 1`. The engine
 * never recomputes from raw events at render time — a timeline is built once
 * (from mock data or real data) and then sampled.
 */
export interface SeasonTimeline {
  totalDays: number
  driverIds: string[]
  days: DaySnapshot[]
}
