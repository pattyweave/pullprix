import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { cn } from '@/lib/utils'

/**
 * A collectible achievement badge. Presentation-only and domain-agnostic so it
 * can be reused anywhere (profile, popovers, unlock toasts). Rarity drives the
 * tint + glow so badges feel earned rather than corporate; hover reveals a
 * tooltip with the full story.
 */

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface BadgeProps {
  /** Emoji icon, e.g. "🏁". */
  icon: string
  /** Display name, e.g. "Pole Position". */
  name: string
  rarity: BadgeRarity
  /** What the badge is for. */
  description: string
  /** ISO date it was unlocked, e.g. "2026-06-21". */
  unlockedDate?: string
  /** Short tooltip override; falls back to the description. */
  tooltip?: string
  /** Icon-only chip (no name label). Useful in dense rows. */
  compact?: boolean
  className?: string
}

const RARITY_VAR: Record<BadgeRarity, string> = {
  common: 'var(--pp-rarity-common)',
  rare: 'var(--pp-rarity-rare)',
  epic: 'var(--pp-rarity-epic)',
  legendary: 'var(--pp-rarity-legendary)',
}

function formatDate(iso?: string): string | null {
  if (!iso) return null
  // Mocked data — parse the Y-M-D parts directly to avoid TZ drift.
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  const month = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][m - 1]
  return `${month} ${d}, ${y}`
}

export function Badge({
  icon,
  name,
  rarity,
  description,
  unlockedDate,
  tooltip,
  compact = false,
  className,
}: BadgeProps) {
  const [hovered, setHovered] = useState(false)
  const color = RARITY_VAR[rarity]
  const unlocked = formatDate(unlockedDate)

  return (
    <div
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <motion.div
        tabIndex={0}
        role="img"
        aria-label={`${name} — ${rarity} badge`}
        className={cn(
          'flex cursor-default items-center gap-1.5 rounded-md outline-none',
          'border bg-text/[0.03] transition-colors duration-200',
          compact ? 'size-8 justify-center p-0' : 'px-2 py-1.5',
        )}
        style={{
          borderColor: `color-mix(in oklch, ${color} 45%, transparent)`,
          boxShadow: hovered
            ? `0 0 18px -4px ${color}, inset 0 0 0 1px color-mix(in oklch, ${color} 30%, transparent)`
            : undefined,
        }}
        animate={{ y: hovered ? -2 : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      >
        <span className="text-base leading-none" aria-hidden>
          {icon}
        </span>
        {!compact && (
          <span className="hud-label whitespace-nowrap text-text">{name}</span>
        )}
      </motion.div>

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14 }}
            className="absolute bottom-full left-0 z-20 mb-2 w-56 hud-panel p-3"
            role="tooltip"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-lg leading-none" aria-hidden>
                {icon}
              </span>
              <span className="font-heading text-sm font-semibold text-text">
                {name}
              </span>
            </div>
            <span
              className="hud-label"
              style={{ color }}
            >
              {rarity}
            </span>
            <p className="mt-2 text-xs leading-relaxed text-text-dim">
              {tooltip ?? description}
            </p>
            {unlocked && (
              <p className="hud-label mt-2 text-text-faint">
                Unlocked {unlocked}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
