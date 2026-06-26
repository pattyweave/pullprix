import { Pause, Play } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The season-replay transport: a timeline scrubber with play/pause. Fully
 * controlled and presentation-only — the parent owns the clock and feeds
 * `day`/`playing`, so this component never references the engine.
 */

export interface ReplayBarProps {
  /** Fractional day cursor (1..totalDays). */
  day: number
  totalDays: number
  playing: boolean
  onTogglePlay: () => void
  onScrub: (day: number) => void
  /** Optional label shown at the cursor, e.g. the leader's code. */
  caption?: string
  className?: string
}

export function ReplayBar({
  day,
  totalDays,
  playing,
  onTogglePlay,
  onScrub,
  caption,
  className,
}: ReplayBarProps) {
  const pct = ((day - 1) / (totalDays - 1)) * 100
  const currentDay = Math.round(day)

  return (
    <div
      className={cn(
        'hud-panel flex items-center gap-4 px-4 py-3',
        className,
      )}
    >
      {/* Play / Pause */}
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={playing ? 'Pause replay' : 'Play replay'}
        aria-pressed={playing}
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          'border border-line-strong bg-text/[0.04] text-text transition-all duration-200',
          'hover:border-accent/50 hover:text-accent hover:shadow-[0_0_18px_-4px_var(--pp-accent)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        )}
      >
        {playing ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="size-4 translate-x-px fill-current" />
        )}
      </button>

      {/* Day readout */}
      <div className="flex w-20 shrink-0 flex-col">
        <span className="hud-label text-text-faint">Day</span>
        <span className="hud-value tabular leading-none">
          {currentDay}
          <span className="ml-1 text-[0.7em] text-text-faint">
            / {totalDays}
          </span>
        </span>
      </div>

      {/* Scrubber */}
      <div className="relative flex-1">
        <div className="flex items-center justify-between">
          <span className="hud-label text-text-faint">Day 1</span>
          <span className="hud-label text-text-faint">Day {totalDays}</span>
        </div>

        <div className="relative mt-1.5 h-6">
          {/* Track */}
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-text/[0.08]">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-75"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Cursor */}
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pct}%` }}
          >
            <div className="size-3.5 rounded-full bg-accent shadow-[0_0_12px_var(--pp-accent)]" />
            {caption && (
              <span className="hud-label absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap text-accent">
                {caption}
              </span>
            )}
          </div>

          {/* The real input sits on top, transparent, for interaction + a11y. */}
          <input
            type="range"
            min={1}
            max={totalDays}
            step={0.01}
            value={day}
            onChange={(e) => onScrub(Number(e.target.value))}
            aria-label="Season day"
            className="absolute inset-0 m-0 w-full cursor-pointer opacity-0"
          />
        </div>
      </div>
    </div>
  )
}
