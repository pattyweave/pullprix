import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** A small pill used for session metadata (P1, DAY 24 / 35, status flags). */
export function Chip({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <span className={cn('hud-chip', className)}>{children}</span>
}
