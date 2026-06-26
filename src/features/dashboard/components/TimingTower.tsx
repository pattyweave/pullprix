import { TimingTower as TimingTowerHud } from '@/components/hud'
import type { TimingRow } from '@/components/hud'
import { getDriver } from '@/features/season'
import { useReplay } from '@/features/replay'

interface TimingTowerProps {
  selectedDriverId?: string | null
  onSelect?: (driverId: string) => void
  /** Namespaces the shared-layout highlight when two towers are mounted. */
  layoutGroup?: string
}

/**
 * Season adapter for the reusable {@link TimingTowerHud}. Reads the current
 * replay snapshot, so the standings reorder + animate as the timeline plays.
 * Maps domain data into the component's presentation-only row model.
 */
export function TimingTower({
  selectedDriverId,
  onSelect,
  layoutGroup,
}: TimingTowerProps) {
  const { snapshot } = useReplay()

  const rows: TimingRow[] = snapshot.standings.map((s) => {
    const driver = getDriver(s.driverId)
    const isOut = s.position > 4 // placeholder "out" treatment, mirrors prototype
    return {
      id: s.driverId,
      position: s.position,
      initials: driver?.code ?? '—',
      teamColor: driver?.color,
      points: s.points,
      gap: isOut
        ? 'Out'
        : s.position === 1
          ? 'Lead'
          : s.gapToLeader,
      gapTone: isOut ? 'danger' : 'default',
    }
  })

  return (
    <TimingTowerHud
      rows={rows}
      selectedId={selectedDriverId}
      onSelect={onSelect}
      layoutGroup={layoutGroup}
    />
  )
}
