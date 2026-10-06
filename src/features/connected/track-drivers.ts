import type { TrackDriver } from '../../components/hud/TrackMap'
import { POINTS_PER_LAP, pointsToLaps } from '../track/points'
import type { DisplayStanding } from './adapter'
// Deliberately separated hues, with contrast supplied by the active color mode.
const DRIVER_PALETTE = Array.from({ length: 8 }, (_, index) => `var(--pp-driver-${index + 1})`)
export function driverColors(participantIds: string[]): ReadonlyMap<string, string> {
  // Rank, score, selection and snapshot order must never affect identity colors.
  const ids = [...new Set(participantIds)].sort()
  return new Map(ids.map((id, index) => [id, DRIVER_PALETTE[index] ??
    // Larger rosters retain unique values instead of cycling the same palette.
    // Names, ranks and selection remain essential when many colors are present.
    `hsl(${((index - DRIVER_PALETTE.length) * 137.508 + 12) % 360} 62% var(--pp-driver-lightness))`]))
}
export function trackDrivers(rows: DisplayStanding[], selectedId?: string, colors = driverColors(rows.map(row => row.participantId))): TrackDriver[] {
  const selected = rows.find(person => person.participantId === selectedId)
  return rows.map(person => {
    const peers = rows.filter(other => (other.points - person.points) % POINTS_PER_LAP === 0)
    const grouped = peers.length > 1 && !peers.some(other => other.participantId === selectedId)
    return { id: person.participantId, name: person.displayName, label: person.participantId === selectedId ? person.displayName : selected && (person.points - selected.points) % POINTS_PER_LAP === 0 ? undefined : grouped ? (peers.at(-1)?.participantId === person.participantId ? `${peers.length} drivers` : undefined) : person.displayName.slice(0, 3).toUpperCase(),
      progress: pointsToLaps(person.points), color: colors.get(person.participantId) ?? DRIVER_PALETTE[0]!, highlight: person.participantId === selectedId }
  })
}
