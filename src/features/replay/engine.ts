import type { DaySnapshot, SeasonTimeline, TrackPosition } from './types'

/**
 * The replay engine: pure sampling over a pre-built timeline. No data source
 * knowledge, no React — given a timeline and a day cursor, return the season's
 * state. Real data plugs in upstream (at timeline construction); this stays
 * identical.
 */

/** Clamp a day cursor into the valid 1..totalDays range. */
export function clampDay(timeline: SeasonTimeline, day: number): number {
  return Math.max(1, Math.min(timeline.totalDays, day))
}

/** The discrete snapshot for an integer day (1-based). */
export function snapshotForDay(
  timeline: SeasonTimeline,
  day: number,
): DaySnapshot {
  const idx = Math.round(clampDay(timeline, day)) - 1
  return timeline.days[idx]
}

/**
 * Sample the season at a possibly-fractional day cursor.
 *
 * Standings and health are discrete (they snap to the nearest day), but track
 * positions are interpolated between the bracketing days so markers glide
 * continuously while the slider is dragged or the clock ticks.
 */
export function sampleDay(
  timeline: SeasonTimeline,
  day: number,
): DaySnapshot {
  const clamped = clampDay(timeline, day)
  const lowIdx = Math.floor(clamped) - 1
  const highIdx = Math.min(timeline.days.length - 1, lowIdx + 1)
  const t = clamped - Math.floor(clamped)

  const low = timeline.days[lowIdx]
  const high = timeline.days[highIdx]

  // Discrete fields come from the day we've most reached.
  const base = t < 0.5 ? low : high

  // Interpolate track progress between the two bracketing days. Positions are
  // monotonic 0..1 (leader near the line, field trailing), so a plain lerp
  // eases each marker between its day spots — no seam crossing.
  const highById = new Map(high.positions.map((p) => [p.driverId, p]))
  const positions: TrackPosition[] = low.positions.map((p) => {
    const next = highById.get(p.driverId) ?? p
    const progress = p.progress + (next.progress - p.progress) * t
    return { driverId: p.driverId, progress }
  })

  return {
    day: base.day,
    standings: base.standings,
    positions,
    health: base.health,
  }
}
