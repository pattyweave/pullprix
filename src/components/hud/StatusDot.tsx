import { cn } from '@/lib/utils'

type Status = 'success' | 'warning' | 'danger' | 'neutral'

/** A glowing status indicator — the live-telemetry tell across the HUD. */
export function StatusDot({
  status,
  className,
}: {
  status: Status
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label={status}
      className={cn('hud-dot', `hud-dot--${status}`, className)}
    />
  )
}
