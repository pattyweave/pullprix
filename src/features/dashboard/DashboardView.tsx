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
 * The /demo dashboard shell — a corner-anchored HUD over a full-bleed canvas
 * driven by the season replay. The replay transport along the bottom is the
 * centrepiece: scrubbing or playing it updates every panel from one clock.
 */
export function DashboardView() {
  const { snapshot } = useReplay()
  const standings = snapshot.standings

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const focusedId = selectedId ?? standings[0]?.driverId ?? null
  const focusedDriver = focusedId ? getDriver(focusedId) : undefined
  const focusedStanding = standings.find((s) => s.driverId === focusedId)

  return (
    <div className="relative h-[calc(100svh-3.25rem)] w-full overflow-hidden">
      {/* Centre stage — the circuit */}
      <div className="absolute inset-0 flex items-center justify-center">
        <TrackMap selectedDriverId={focusedId} onSelect={setSelectedId} />
      </div>

      {/* Left rail — one managed column: identity, standings, driver profile. */}
      <div className="absolute inset-y-(--pp-gutter) left-(--pp-gutter) flex w-72 flex-col gap-4 overflow-y-auto pr-1">
        <Panel variant="ghost">
          <PanelBody className="p-(--pp-panel-pad)">
            <SeasonHeader />
          </PanelBody>
        </Panel>
        <Panel variant="ghost">
          <PanelHeader label="Timing Tower" />
          <PanelBody className="px-2 pb-2">
            <TimingTower
              selectedDriverId={focusedId}
              onSelect={setSelectedId}
            />
          </PanelBody>
        </Panel>

        {focusedDriver && (
          <Panel variant="ghost" className="mt-auto">
            <PanelHeader label="Driver" />
            <PanelBody>
              <DriverStatsCard
                driver={focusedDriver}
                standing={focusedStanding}
              />
            </PanelBody>
          </Panel>
        )}
      </div>

      {/* Top-right — Race Control rail */}
      <div className="absolute right-(--pp-gutter) top-(--pp-gutter) max-h-[calc(100%-2*var(--pp-gutter))] w-72 overflow-y-auto">
        <Panel variant="ghost">
          <PanelHeader label="Pit Wall" />
          <PanelBody>
            <RaceControlPanel />
          </PanelBody>
        </Panel>
      </div>

      {/* Bottom-centre — the replay transport (the centrepiece control). */}
      <div className="absolute bottom-(--pp-gutter) left-1/2 w-[min(46rem,calc(100%-21rem))] -translate-x-1/2">
        <ReplayControls />
      </div>
    </div>
  )
}
