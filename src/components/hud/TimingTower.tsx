import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'

/**
 * A single row of the timing tower. This is a presentation-only view model —
 * the parent maps its domain data (standings + driver lookup) into these, so
 * the component stays completely reusable and never references driver names or
 * any app-specific store.
 */
export interface TimingRow {
  /** Stable identity for selection + animation. */
  id: string
  /** 1-based running position. */
  position: number
  /** Driver initials / short code shown as the primary label, e.g. "ADA". */
  initials: string
  /** Optional team color for the leading stripe. */
  teamColor?: string
  /**
   * Gap to the leader. A number renders as "+N"; a string renders verbatim
   * (e.g. "LEAD", "OUT"). Leave undefined to hide.
   */
  gap?: number | string
  /** Current points total. */
  points: number
  /** Tone for the gap text — lets the parent flag "out"/danger states. */
  gapTone?: 'default' | 'danger' | 'accent'
}

export interface TimingTowerProps {
  /** Rows to display, already ordered by the parent. */
  rows: TimingRow[]
  /** Currently selected row id, or null/undefined when nothing is selected. */
  selectedId?: string | null
  /** Fired with a row id when that row is activated (click / keyboard). */
  onSelect?: (id: string) => void
  className?: string
}

const GAP_TONE: Record<NonNullable<TimingRow['gapTone']>, string> = {
  default: 'text-text-faint',
  danger: 'text-danger',
  accent: 'text-accent',
}

/**
 * Pull Prix Timing Tower — a compact, minimal standings list inspired by
 * motorsport timing towers without copying one.
 *
 * Fully controlled and reusable: it owns no data, derives nothing from a store,
 * and renders only what `rows` describe. Selection and hover are visual;
 * position changes animate via shared layout (`layout` + ordered keys) so
 * reordering the `rows` array later animates for free.
 */
export function TimingTower({
  rows,
  selectedId,
  onSelect,
  className,
}: TimingTowerProps) {
  return (
    <ul
      className={cn('flex flex-col', className)}
      role="listbox"
      aria-label="Standings"
    >
      {rows.map((row) => {
        const selected = row.id === selectedId
        const gapText =
          typeof row.gap === 'number' ? `+${row.gap}` : row.gap

        return (
          <motion.li
            layout
            key={row.id}
            role="option"
            aria-selected={selected}
            tabIndex={0}
            onClick={() => onSelect?.(row.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect?.(row.id)
              }
            }}
            className={cn(
              'group relative flex cursor-pointer items-center gap-3 py-2.5 pl-3 pr-2',
              'outline-none transition-colors duration-200',
              // Subtle hover glow — a faint surface lift, no harsh fill.
              'hover:bg-text/[0.03]',
              'focus-visible:ring-1 focus-visible:ring-accent/40',
            )}
          >
            {/* Premium animated selection highlight: a shared-layout element
                that glides between rows, plus a soft inner glow. */}
            {selected && (
              <motion.span
                layoutId="timing-tower-selection"
                aria-hidden
                className="absolute inset-0 rounded-md bg-text/[0.06] ring-1 ring-inset ring-accent/30"
                style={{ boxShadow: '0 0 24px -8px var(--pp-accent)' }}
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
              />
            )}

            {/* Team color stripe (optional) */}
            <span
              aria-hidden
              className="hud-accent-bar relative z-10 transition-all duration-200 group-hover:brightness-125"
              style={{
                backgroundColor: row.teamColor ?? 'var(--pp-line-strong)',
                boxShadow: selected && row.teamColor
                  ? `0 0 12px ${row.teamColor}`
                  : undefined,
              }}
            />

            {/* Position */}
            <span
              className={cn(
                'relative z-10 w-4 text-center font-mono text-xs tabular-nums transition-colors',
                selected ? 'text-text' : 'text-text-faint',
              )}
            >
              {row.position}
            </span>

            {/* Initials — primary label, uppercase */}
            <span
              className={cn(
                'relative z-10 flex-1 font-heading text-sm font-semibold uppercase tracking-[0.08em] transition-colors',
                selected
                  ? 'text-text'
                  : 'text-text-dim group-hover:text-text',
              )}
            >
              {row.initials}
            </span>

            {/* Gap to leader */}
            {row.gap !== undefined && (
              <span
                className={cn(
                  'hud-label relative z-10 tabular-nums',
                  GAP_TONE[row.gapTone ?? 'default'],
                )}
              >
                {gapText}
              </span>
            )}

            {/* Points */}
            <span
              className={cn(
                'relative z-10 w-9 text-right font-mono text-xs font-semibold tabular-nums transition-colors',
                selected ? 'text-accent' : 'text-text-dim',
              )}
            >
              {row.points}
            </span>
          </motion.li>
        )
      })}
    </ul>
  )
}
