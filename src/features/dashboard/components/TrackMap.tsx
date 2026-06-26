import { TrackMap as TrackMapHud } from '@/components/hud'
import type { TrackDriver } from '@/components/hud'
import { getDriver } from '@/features/season'
import { useReplay } from '@/features/replay'
import { JACAREPAGUA } from '@/features/track/circuits'

interface TrackMapProps {
  selectedDriverId?: string | null
  onSelect?: (driverId: string) => void
}

/**
 * Season adapter for the reusable {@link TrackMapHud}. Feeds the replay
 * snapshot's per-day track positions, which the engine interpolates between
 * days — so markers glide continuously as the timeline plays or is scrubbed.
 */
export function TrackMap({ selectedDriverId, onSelect }: TrackMapProps) {
  const { snapshot } = useReplay()

  const drivers: TrackDriver[] = snapshot.positions.map((p) => {
    const driver = getDriver(p.driverId)
    return {
      id: p.driverId,
      label: driver?.code,
      progress: p.progress,
      color: driver?.color,
      highlight: p.driverId === selectedDriverId,
    }
  })

  // Zoom past the fit-box so the track dominates the canvas; its empty corners
  // tuck behind the opaque corner panels.
  return (
    <TrackMapHud
      circuit={JACAREPAGUA}
      drivers={drivers}
      scale={1.2}
      onSelectDriver={onSelect}
    />
  )
}
