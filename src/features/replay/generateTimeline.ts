import { drivers } from '@/features/season'
import type { DriverStanding, ReviewHealth } from '@/features/season'

import type { DaySnapshot, SeasonTimeline, TrackPosition } from './types'

/**
 * Mock season data source. This is the ONLY file that real GitHub data would
 * replace: produce a {@link SeasonTimeline} from whatever source, and the
 * engine + UI are untouched.
 *
 * The generator is fully deterministic (a hash-based PRNG, no Math.random) so
 * the same season replays identically every time, with believable lead changes
 * and streaks.
 */

/** Deterministic 0..1 pseudo-random from integer inputs (no global RNG). */
function rng(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = (h * 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Each driver gets a "form" profile so the championship has a shape. */
interface Form {
  /** Baseline points earned per day. */
  base: number
  /** Day index where this driver peaks (drives momentum swings). */
  peakDay: number
  /** How much their form spikes around the peak. */
  swing: number
}

function buildForms(totalDays: number): Record<string, Form> {
  const forms: Record<string, Form> = {}
  drivers.forEach((d, i) => {
    forms[d.id] = {
      base: 4 + rng(i, 1) * 6, // 4..10 pts/day
      peakDay: Math.floor(rng(i, 2) * totalDays),
      swing: 2 + rng(i, 3) * 5,
    }
  })
  return forms
}

/** Points a driver earns on a given day, from their form + daily noise. */
function dailyPoints(idx: number, day: number, form: Form) {
  const proximity = 1 - Math.min(1, Math.abs(day - form.peakDay) / 10)
  const formBonus = form.swing * proximity
  const noise = rng(idx, day + 100) * 4
  return Math.round(form.base + formBonus + noise)
}

function buildStandings(
  cumulative: { id: string; points: number; reviews: number }[],
  prevPositions: Record<string, number>,
): DriverStanding[] {
  const sorted = [...cumulative].sort((a, b) => b.points - a.points)
  const leaderPoints = sorted[0]?.points ?? 0

  return sorted.map((c, i) => {
    const position = i + 1
    const prev = prevPositions[c.id] ?? position
    return {
      driverId: c.id,
      position,
      points: c.points,
      reviews: c.reviews,
      approvals: Math.round(c.reviews * 0.62),
      delta: prev - position, // + gained places, - lost
      gapToLeader: leaderPoints - c.points,
      fastestLap: false,
    }
  })
}

/**
 * Track progress as cumulative distance travelled.
 *
 * A driver's total season points map directly to total distance: every point
 * is forward progress, so the marker only ever advances around the lap (it
 * never slides backward). The championship leader is furthest along — and with
 * enough of a points lead, literally laps the field. `progress` can exceed 1;
 * the path sampler wraps it onto the loop.
 */
const POINTS_PER_LAP = 90 // tuned so the season leader runs ~5 laps total

function buildPositions(
  cumulative: { id: string; points: number }[],
): TrackPosition[] {
  return cumulative.map((c) => ({
    driverId: c.id,
    progress: c.points / POINTS_PER_LAP,
  }))
}

/** Review-health metrics evolve over the season with mild daily variation. */
function buildHealth(day: number, totalDays: number): ReviewHealth {
  const velocity = 6 + rng(day, 7) * 5 // 6..11
  const needing = 3 + Math.round(rng(day, 8) * 7) // 3..10
  const waiting = Math.round(rng(day, 9) * 3) // 0..3
  const reviewers = 3 + Math.round(rng(day, 10) * 3) // 3..6
  const repos = [
    'pull-prix/api',
    'pull-prix/web',
    'pull-prix/infra',
    'pull-prix/mobile',
  ]
  const trend =
    day < totalDays * 0.33
      ? 'rising'
      : day < totalDays * 0.66
        ? 'steady'
        : 'cooling'
  const signal = waiting >= 3 ? 'red' : waiting >= 1 ? 'yellow' : 'green'

  return {
    conditions: {
      reviewVelocity: Math.round(velocity * 10) / 10,
      velocityTrend: trend,
      teamTemperature: signal === 'red' ? 'Stretched' : 'Focused',
      signal,
    },
    control: {
      uniqueReviewers: reviewers,
      prsNeedingReview: needing,
      prsWaitingOver24h: waiting,
      mostUnderReviewedRepo: repos[Math.floor(rng(day, 11) * repos.length)],
    },
    nextReview: {
      repo: repos[Math.floor(rng(day, 12) * repos.length)],
      pullNumber: 4800 + day * 3 + Math.floor(rng(day, 13) * 3),
      title: 'feat: review-health aggregation endpoint',
      waiting: `${18 + Math.round(rng(day, 14) * 30)}h`,
      reason: waiting >= 2 ? 'aging PR' : 'unclaimed review',
    },
  }
}

/**
 * Build the full mock season timeline. Deterministic and pure — call once and
 * memoize. Swap this function's body for a real-data loader to go live.
 */
export function generateTimeline(totalDays = 35): SeasonTimeline {
  const forms = buildForms(totalDays)
  const driverIds = drivers.map((d) => d.id)

  const cumulative = drivers.map((d) => ({
    id: d.id,
    points: 0,
    reviews: 0,
  }))

  const days: DaySnapshot[] = []
  let prevPositions: Record<string, number> = {}

  for (let day = 1; day <= totalDays; day++) {
    cumulative.forEach((c, idx) => {
      const pts = dailyPoints(idx, day, forms[c.id])
      c.points += pts
      // Roughly one review per ~4 points earned, plus a daily floor.
      c.reviews += 1 + Math.round(pts / 4)
    })

    const standings = buildStandings(cumulative, prevPositions)
    prevPositions = Object.fromEntries(
      standings.map((s) => [s.driverId, s.position]),
    )

    days.push({
      day,
      standings,
      positions: buildPositions(cumulative),
      health: buildHealth(day, totalDays),
    })
  }

  return { totalDays, driverIds, days }
}
