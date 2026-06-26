import { cn } from '@/lib/utils'

interface StatProps {
  /** Tiny uppercase descriptor. */
  label: string
  /** The value — rendered in tabular mono. */
  value: string | number
  /** Optional unit suffix shown smaller and dimmed. */
  unit?: string
  /** Color the value to carry status meaning. */
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'
  align?: 'start' | 'end'
  className?: string
}

const TONE: Record<NonNullable<StatProps['tone']>, string> = {
  default: 'text-text',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  accent: 'text-accent',
}

/**
 * The fundamental telemetry unit: a wide-tracked label stacked over a value.
 * The label/value pairing is the core of the design language.
 */
export function Stat({
  label,
  value,
  unit,
  tone = 'default',
  align = 'start',
  className,
}: StatProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5',
        align === 'end' && 'items-end text-right',
        className,
      )}
    >
      <span className="hud-label">{label}</span>
      <span className={cn('hud-value', TONE[tone])}>
        {value}
        {unit && (
          <span className="ml-1 text-[0.7em] text-text-faint">{unit}</span>
        )}
      </span>
    </div>
  )
}

/** A horizontal telemetry row: label on the left, value on the right. */
export function StatRow({
  label,
  value,
  unit,
  tone = 'default',
  className,
}: Omit<StatProps, 'align'>) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', className)}>
      <span className="hud-label">{label}</span>
      <span className={cn('hud-value', TONE[tone])}>
        {value}
        {unit && (
          <span className="ml-1 text-[0.7em] text-text-faint">{unit}</span>
        )}
      </span>
    </div>
  )
}
