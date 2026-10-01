import type { TrackDriver } from '../../components/hud/TrackMap'
import { POINTS_PER_LAP, pointsToLaps } from '../track/points'
import type { DisplayStanding } from './adapter'
export function trackDrivers(rows: DisplayStanding[], selectedId?: string): TrackDriver[] {
  const selected = rows.find(person => person.participantId === selectedId)
  return rows.map(person => {
    let hash = 0
    for (const character of person.participantId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
    return { id: person.participantId, label: person.participantId === selectedId ? person.displayName : selected && (person.points - selected.points) % POINTS_PER_LAP === 0 ? undefined : person.displayName.slice(0, 3).toUpperCase(),
      progress: pointsToLaps(person.points), color: `hsl(${hash % 360} 75% 65%)`, highlight: person.participantId === selectedId }
  })
}
