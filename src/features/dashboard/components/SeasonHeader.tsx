import { Chip, StatusDot } from '@/components/hud'
import { useSeason } from '@/features/season'
import { useReplay } from '@/features/replay'

/**
 * Top-left HUD cluster: championship identity + replay session chips. The day
 * chip tracks the replay cursor, and the status dot pulses while playing.
 */
export function SeasonHeader() {
  const { data: season } = useSeason()
  const { currentDay, totalDays, playing } = useReplay()
  if (!season) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <StatusDot status={playing ? 'danger' : 'neutral'} />
        <h1 className="font-heading text-sm font-semibold uppercase tracking-[0.18em] text-text">
          Pull Prix
        </h1>
      </div>
      <p className="hud-label max-w-[14ch] leading-relaxed">{season.name}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Chip>{playing ? 'Replay' : 'Paused'}</Chip>
        <Chip>
          Day {currentDay} / {totalDays}
        </Chip>
      </div>
    </div>
  )
}
