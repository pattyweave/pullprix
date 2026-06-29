import { TimingTower, TrackMap } from '@/components/hud'
import type { TimingRow, TrackDriver } from '@/components/hud'
import { getDriver } from '@/features/season'
import { ReplayProvider, useReplay } from '@/features/replay'
import { JACAREPAGUA } from '@/features/track/circuits'

/**
 * A self-contained, auto-playing miniature of the dashboard for the marketing
 * hero. It reuses the real HUD components and replay engine — so it's a *live*
 * preview, not a screenshot — but is non-interactive and framed. Markers move,
 * the timing tower reorders, and the leader glow pulses as the season plays.
 */
export function DashboardPreview() {
  return (
    <ReplayProvider autoPlay loop>
      <PreviewInner />
    </ReplayProvider>
  )
}

function PreviewInner() {
  const { snapshot, currentDay, totalDays } = useReplay()
  const standings = snapshot.standings
  const leaderId = standings[0]?.driverId ?? null

  const rows: TimingRow[] = standings.map((s) => {
    const driver = getDriver(s.driverId)
    return {
      id: s.driverId,
      position: s.position,
      initials: driver?.code ?? '—',
      teamColor: driver?.color,
      points: s.points,
      gap: s.position === 1 ? 'Lead' : s.gapToLeader,
    }
  })

  const trackDrivers: TrackDriver[] = snapshot.positions.map((p) => {
    const driver = getDriver(p.driverId)
    return {
      id: p.driverId,
      label: driver?.code,
      progress: p.progress,
      color: driver?.color,
      highlight: p.driverId === leaderId,
    }
  })

  return (
    <div className="hud-panel relative aspect-4/5 w-full overflow-hidden sm:aspect-16/11">
      {/* Track fills the frame. Taller mobile frame + a smaller scale keeps the
          circuit clear of the overlay panels instead of bleeding under them. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <TrackMap
          circuit={JACAREPAGUA}
          drivers={trackDrivers}
          className="scale-90 sm:scale-100"
          scale={1.15}
        />
      </div>

      {/* Mini timing tower, top-left. Narrower + fewer rows on mobile so it
          never spills across the track or collides with the Season chip. */}
      <div className="hud-panel-ghost absolute left-3 top-3 w-40 px-1.5 py-2 sm:w-44">
        <span className="hud-label mb-1 block px-1.5 text-text-dim">
          Timing Tower
        </span>
        {/* `dense` tightens the row gaps and columns so the full row — points
            included — fits inside this narrow panel without overflowing. */}
        <div className="pointer-events-none w-full">
          <TimingTower rows={rows.slice(0, 3)} selectedId={leaderId} dense />
        </div>
      </div>

      {/* Session chip, top-right */}
      <div className="hud-panel-ghost absolute right-3 top-3 flex flex-col gap-0.5 px-2.5 py-1.5 sm:px-3 sm:py-2">
        <span className="hud-label text-text-faint">Season</span>
        <span className="hud-value tabular leading-none">
          Day {currentDay}
          <span className="ml-1 text-[0.7em] text-text-faint">
            / {totalDays}
          </span>
        </span>
      </div>

      {/* Live tag, bottom-left */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <span className="hud-dot hud-dot--danger animate-pulse" />
        <span className="hud-label text-text-dim">Live Replay</span>
      </div>
    </div>
  )
}
