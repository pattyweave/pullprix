import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PanelProps {
  children: ReactNode
  /** "ghost" reads as painted-onto-canvas; "solid" is a bordered HUD panel. */
  variant?: 'solid' | 'ghost'
  className?: string
}

/**
 * The base HUD surface. Every panel in the app composes from this so the
 * border / fill / blur treatment stays consistent.
 */
export function Panel({ children, variant = 'solid', className }: PanelProps) {
  return (
    <div
      className={cn(
        variant === 'ghost' ? 'hud-panel-ghost' : 'hud-panel',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface PanelHeaderProps {
  /** Tiny uppercase label, e.g. "TIMING TOWER". */
  label: string
  /** Optional right-aligned slot (chip, status, count). */
  action?: ReactNode
  className?: string
}

/** Standard panel header: a wide-tracked label with an optional action slot. */
export function PanelHeader({ label, action, className }: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-(--pp-panel-pad) pt-(--pp-panel-pad) pb-3',
        className,
      )}
    >
      <span className="hud-label">{label}</span>
      {action}
    </div>
  )
}

/** Body region of a panel with consistent horizontal padding. */
export function PanelBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('px-(--pp-panel-pad) pb-(--pp-panel-pad)', className)}>
      {children}
    </div>
  )
}
