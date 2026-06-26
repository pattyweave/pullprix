import { ArrowRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { StatRow } from './Stat'
import { StatusDot } from './StatusDot'

/**
 * Race Control — presentation-only and domain-agnostic. The parent maps its
 * review-health data into these props, so the component never references a
 * store. Three sections: flavor track conditions, the actionable control
 * metrics, and a single recommended next review.
 */

type Signal = 'green' | 'yellow' | 'red'
type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

export interface RaceControlConditions {
  reviewVelocity: string
  teamTemperature: string
  signal: Signal
  /** Label for the signal, e.g. "CAUTION". */
  signalLabel: string
}

export interface RaceControlMetric {
  label: string
  value: string | number
  tone?: Tone
  /** Render as a large emphasised figure rather than a row. */
  hero?: boolean
}

export interface RaceControlNextReview {
  repo: string
  pullNumber: number
  title: string
  waiting: string
  reason: string
}

export interface RaceControlProps {
  conditions: RaceControlConditions
  metrics: RaceControlMetric[]
  nextReview: RaceControlNextReview
  /** Non-functional for now; hover still reads as clickable. */
  onPickUp?: () => void
  className?: string
}

const SIGNAL_STATUS: Record<Signal, 'success' | 'warning' | 'danger'> = {
  green: 'success',
  yellow: 'warning',
  red: 'danger',
}

const TONE_TEXT: Record<Tone, string> = {
  default: 'text-text',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  accent: 'text-accent',
}

/** Tiny section heading used between the panel's blocks. */
function SectionLabel({ children }: { children: string }) {
  return <span className="hud-label text-text-dim">{children}</span>
}

export function RaceControl({
  conditions,
  metrics,
  nextReview,
  onPickUp,
  className,
}: RaceControlProps) {
  const heroes = metrics.filter((m) => m.hero)
  const rows = metrics.filter((m) => !m.hero)

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* ---- TRACK CONDITIONS (flavor) ------------------------------------ */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Track Conditions</SectionLabel>
        <div className="flex flex-col gap-2.5">
          <StatRow label="Review Velocity" value={conditions.reviewVelocity} />
          <StatRow label="Team Temp" value={conditions.teamTemperature} />
          <div className="flex items-center justify-between gap-4">
            <span className="hud-label">Signal</span>
            <span className="flex items-center gap-2">
              <StatusDot status={SIGNAL_STATUS[conditions.signal]} />
              <span
                className={cn(
                  'hud-value',
                  TONE_TEXT[
                    conditions.signal === 'green'
                      ? 'success'
                      : conditions.signal === 'yellow'
                        ? 'warning'
                        : 'danger'
                  ],
                )}
              >
                {conditions.signalLabel}
              </span>
            </span>
          </div>
        </div>
      </section>

      <hr className="hud-rule" />

      {/* ---- RACE CONTROL (main content) --------------------------------- */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Race Control</SectionLabel>

        {/* Hero metrics — the figures that should stop the eye. */}
        {heroes.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {heroes.map((m) => (
              <div
                key={m.label}
                className="flex flex-col gap-1 rounded-md bg-text/[0.03] px-3 py-2.5 ring-1 ring-inset ring-line"
              >
                <span className={cn('hud-display text-3xl', TONE_TEXT[m.tone ?? 'default'])}>
                  {m.value}
                </span>
                <span className="hud-label leading-tight">{m.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Secondary metrics as telemetry rows. */}
        {rows.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {rows.map((m) => (
              <StatRow
                key={m.label}
                label={m.label}
                value={m.value}
                tone={m.tone}
              />
            ))}
          </div>
        )}
      </section>

      <hr className="hud-rule" />

      {/* ---- NEXT REVIEW (recommended PR card) --------------------------- */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Next Review</SectionLabel>

        <button
          type="button"
          onClick={onPickUp}
          className={cn(
            'group flex flex-col gap-3 rounded-md p-3 text-left',
            'bg-text/[0.03] ring-1 ring-inset ring-line transition-all duration-200',
            'hover:bg-text/[0.06] hover:ring-accent/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="hud-label truncate text-text-dim">
              {nextReview.repo}
            </span>
            <span className="hud-label shrink-0 text-text-faint">
              #{nextReview.pullNumber}
            </span>
          </div>

          <p className="font-heading text-sm font-medium leading-snug text-text">
            {nextReview.title}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="hud-chip border-warning/40 text-warning">
              {nextReview.reason}
            </span>
            <span className="hud-label text-text-faint">
              Waiting {nextReview.waiting}
            </span>
          </div>

          <span className="mt-1 flex items-center gap-1.5 text-accent">
            <span className="hud-label text-accent">Pick up review</span>
            <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </button>
      </section>
    </div>
  )
}
