import { useState } from 'react'

import { Panel, PanelBody, PanelHeader } from '@/components/hud'
import { getDriver } from '@/features/season'
import { useReplay } from '@/features/replay'

import {
  DriverStatsCard,
  RaceControlPanel,
  ReplayControls,
  SeasonHeader,
  TimingTower,
  TrackMap,
} from './components'

/**
 * The /demo dashboard.
 *
 * Two layouts share one set of panel fragments:
 *  - md+ : a corner-anchored HUD over a full-bleed canvas (the broadcast/pit-wall
 *          look) — panels float absolutely, the track fills behind them.
 *  - <md : a single vertical scroll — the track sits in a fixed-aspect hero, the
 *          panels stack as full-width cards, and the replay transport pins to the
 *          bottom. The absolute HUD collides on a phone, so it's md-only.
 */
export function DashboardView() {
  const { snapshot } = useReplay()
  const standings = snapshot.standings

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const focusedId = selectedId ?? standings[0]?.driverId ?? null
  const focusedDriver = focusedId ? getDriver(focusedId) : undefined
  const focusedStanding = standings.find((s) => s.driverId === focusedId)

  // Panel fragments — authored once, placed by each layout.
  const identityPanel = (
    <Panel variant="ghost">
      <PanelBody className="p-(--pp-panel-pad)">
        <SeasonHeader />
      </PanelBody>
    </Panel>
  )

  // Both layouts are mounted at once (one is display:hidden), so each tower
  // needs its own layoutGroup or the shared-layout highlights collide and the
  // selection flickers out. `layoutGroup` namespaces the highlight's layoutId.
  const renderTimingPanel = (layoutGroup: string) => (
    <Panel variant="ghost">
      <PanelHeader label="Timing Tower" />
      <PanelBody className="px-2 pb-2">
        <TimingTower
          selectedDriverId={focusedId}
          onSelect={setSelectedId}
          layoutGroup={layoutGroup}
        />
      </PanelBody>
    </Panel>
  )

  const driverPanel = focusedDriver && (
    <Panel variant="ghost" className="md:mt-auto">
      <PanelHeader label="Driver" />
      <PanelBody>
        <DriverStatsCard driver={focusedDriver} standing={focusedStanding} />
      </PanelBody>
    </Panel>
  )

  const pitWallPanel = (
    <Panel variant="ghost">
      <PanelHeader label="Pit Wall" />
      <PanelBody>
        <RaceControlPanel />
      </PanelBody>
    </Panel>
  )

  const track = (
    <TrackMap selectedDriverId={focusedId} onSelect={setSelectedId} />
  )

  return (
    <>
      {/* ============================ MOBILE (< md) ============================ */}
      {/* Single vertical scroll; replay transport pinned to the bottom. */}
      <div className="flex h-[calc(100svh-3.25rem)] w-full flex-col md:hidden">
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
          <div className="flex flex-col gap-4">
            {identityPanel}
            {/* Track hero — fixed aspect so the SVG has a real box to fit. */}
            <div className="aspect-4/3 w-full overflow-hidden rounded-(--pp-radius)">
              {track}
            </div>
            {renderTimingPanel('timing-tower-mobile')}
            {driverPanel}
            {pitWallPanel}
          </div>
        </div>
        {/* Sticky transport — sits above the scroll on the canvas. */}
        <div className="shrink-0 border-t border-line bg-void/80 px-4 py-3 backdrop-blur-md">
          <ReplayControls />
        </div>
      </div>

      {/* ============================ DESKTOP (md+) =========================== */}
      <div className="relative hidden h-[calc(100svh-3.25rem)] w-full overflow-hidden md:block">
        {/* Centre stage — the circuit */}
        <div className="absolute inset-0 flex items-center justify-center">
          <TrackMap selectedDriverId={focusedId} onSelect={setSelectedId} scale={1.2} />
        </div>

        {/* Left rail — identity, standings, driver profile. */}
        <div className="absolute inset-y-(--pp-gutter) left-(--pp-gutter) flex w-72 flex-col gap-4 overflow-y-auto pr-1">
          {identityPanel}
          {renderTimingPanel('timing-tower-desktop')}
          {driverPanel}
        </div>

        {/* Top-right — Race Control rail */}
        <div className="absolute right-(--pp-gutter) top-(--pp-gutter) max-h-[calc(100%-2*var(--pp-gutter))] w-72 overflow-y-auto">
          {pitWallPanel}
        </div>

        {/* Bottom-centre — the replay transport (the centrepiece control). */}
        <div className="absolute bottom-(--pp-gutter) left-1/2 w-[min(46rem,calc(100%-21rem))] -translate-x-1/2">
          <ReplayControls />
        </div>
      </div>
    </>
  )
}
