import { RaceControl } from '@/components/hud'
import type { RaceControlMetric } from '@/components/hud'
import type { SignalStatus } from '@/features/season'
import { useReplay } from '@/features/replay'

const SIGNAL_LABEL: Record<SignalStatus, string> = {
  green: 'Clear',
  yellow: 'Caution',
  red: 'Stopped',
}

const VELOCITY_TREND: Record<string, string> = {
  rising: '↑',
  steady: '→',
  cooling: '↓',
}

/**
 * Season adapter for the reusable {@link RaceControl}. Maps the mocked review
 * health into the panel's three sections — flavor track conditions, the
 * actionable control metrics, and a recommended next review. The "Pick up
 * review" CTA is intentionally non-functional for now.
 */
export function RaceControlPanel() {
  const { snapshot } = useReplay()
  const { conditions, control, nextReview } = snapshot.health

  const metrics: RaceControlMetric[] = [
    // Hero figures — the numbers that should stop the eye.
    {
      label: 'PRs Needing Review',
      value: control.prsNeedingReview,
      tone: control.prsNeedingReview > 5 ? 'warning' : 'default',
      hero: true,
    },
    {
      label: 'Waiting > 24h',
      value: control.prsWaitingOver24h,
      tone: control.prsWaitingOver24h > 0 ? 'danger' : 'success',
      hero: true,
    },
    // Secondary telemetry rows.
    { label: 'Unique Reviewers', value: control.uniqueReviewers },
    {
      label: 'Cold Repo',
      value: control.mostUnderReviewedRepo,
      tone: 'info',
    },
  ]

  return (
    <RaceControl
      conditions={{
        reviewVelocity: `${conditions.reviewVelocity} ${VELOCITY_TREND[conditions.velocityTrend] ?? ''}`,
        teamTemperature: conditions.teamTemperature,
        signal: conditions.signal,
        signalLabel: SIGNAL_LABEL[conditions.signal],
      }}
      metrics={metrics}
      nextReview={{
        repo: nextReview.repo,
        pullNumber: nextReview.pullNumber,
        title: nextReview.title,
        waiting: nextReview.waiting,
        reason: nextReview.reason,
      }}
    />
  )
}
