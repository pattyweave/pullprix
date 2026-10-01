import { POINTS_PER_LAP } from '../track/points'
import { SCORING_POLICY_V1 as policy } from '../../../supabase/functions/_shared/scoring/v1'
export function ScoringSummary({ compact = false }: { compact?: boolean } = {}) {
  const scores = [
    ['Approval', policy.approval], ['Approval with feedback', policy.approvalWithFeedback],
    ['Formal comment review with feedback', policy.commentReviewWithFeedback], ['Changes requested', policy.changesRequested],
    ['Qualifying follow-through', `+${policy.followThrough}`], ['First qualifying rescue of a PR waiting over 24h', `+${policy.agingPrRescue}`],
  ] as const
  return <details className={compact ? "mt-4 border-t border-line pt-4" : "mt-6 rounded border border-line p-4"}>
    <summary className="cursor-pointer font-semibold">How championship points work</summary>
    {compact && <p className="mt-4 text-sm text-text-faint">{POINTS_PER_LAP} points per lap. Track positions wrap each lap; standings show total points.</p>}
    <p className="mt-4 text-sm">Earn points for eligible formal reviews on ready PRs while review work is still needed.</p>
    <dl className="mt-4 space-y-2">{scores.map(([label, points]) => <div key={label} className="flex justify-between gap-4 text-sm"><dt>{label}</dt><dd className="shrink-0 font-mono">{points} pts</dd></div>)}</dl>
    <p className="mt-4 text-sm text-text-faint">One base award and at most one follow-through bonus per reviewer per PR. Without enforced review requirements, only the first two eligible reviewers score.</p>
    <p className="mt-3 text-sm text-text-faint">Self-reviews, bot-authored PRs and extra comment volume do not earn points. Streaks do not multiply points. Dismissed approvals retain earned credit; deleted or ineligible reviews can reverse it.</p>
    <p className="mt-3 text-sm text-text-faint">Imported activity builds your roster. Only eligible work within the season and after your team’s scoring start earns points.</p>
  </details>
}
