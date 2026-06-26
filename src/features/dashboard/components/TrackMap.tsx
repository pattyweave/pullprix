import { TrackMap as TrackMapHud } from '@/components/hud'
import type { TrackDriver } from '@/components/hud'
import { getDriver } from '@/features/season'
import { useReplay } from '@/features/replay'
import { JACAREPAGUA } from '@/features/track/circuits'

interface TrackMapProps {
  selectedDriverId?: string | null
  onSelect?: (driverId: string) => void
  /**
   * Zoom relative to a contain-fit. Desktop passes 1.2 so the track bleeds
   * behind the corner panels; mobile leaves it at 1 so the whole circuit fits
   * inside its hero box (no bleeding corners to clip with nothing behind them).
   */
  scale?: number
}

/**
 * Season adapter for the reusable {@link TrackMapHud}. Feeds the replay
 * snapshot's per-day track positions, which the engine interpolates between
 * days — so markers glide continuously as the timeline plays or is scrubbed.
 */
export function TrackMap({
  selectedDriverId,
  onSelect,
  scale = 1,
}: TrackMapProps) {
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

  return (
    <TrackMapHud
      circuit={JACAREPAGUA}
      drivers={drivers}
      scale={scale}
      onSelectDriver={onSelect}
    />
  )
}
