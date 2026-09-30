/** PP-040: pure policy, not a database writer or a theme mechanic. */
export const SCORING_POLICY_V1 = Object.freeze({
  version: "v1" as const, approval: 8, approvalWithFeedback: 10,
  commentReviewWithFeedback: 10, changesRequested: 12, followThrough: 4,
  agingPrRescue: 3, agingThresholdHours: 24, fallbackReviewers: 2,
})

export type ReviewOutcome = "approved" | "commented" | "changes_requested" | "dismissed"
export type ScoreKind = "approval" | "approval_with_feedback" | "comment_review_with_feedback" |
  "changes_requested" | "follow_through" | "aging_pr_rescue"
export type ReviewCredit = "required" | "satisfied" | "unconfigured" | "unknown"
export type ReviewFact = {
  id: string
  githubReviewId: number
  actorGithubUserId: number
  occurredAt: string
  outcome: ReviewOutcome
  bodyPresent: boolean
  effective: boolean
  // Canonical GitHub validity remains false after dismissal. A verified prior
  // approval still earns work credit; deletion is never covered by this flag.
  approvalDismissed?: boolean
  commitId: string
  url: string
  // These are event-time facts, never inferred from the PR's current snapshot.
  readiness: { state: "ready"; since: string } | { state: "draft" | "closed" | "unknown" }
  creditBeforeReview: ReviewCredit
  // Explicit initial-observation fallback, NOT a reconstructed historical gate.
  // SQL verifies this is the first check and no intervening PR changes exist.
  initialUnconfiguredObservation?: { openedAt: string; observedAt: string; headSha: string } | null
  feedbackComplete: boolean
}
export type ScoringInput = {
  policyVersion: "v1"
  organizationId: string
  season: { id: string; startsAt: string; endsAt: string; eligibleFrom: string }
  pullRequest: { id: string; repositoryId: string; number: number; url: string;
    authorGithubUserId: number; authorEligible: boolean | null }
  // Retain historical access periods: removing a repo must not erase past points.
  repositoryAccess: readonly { from: string; until: string | null }[]
  participants: readonly { id: string; githubUserId: number; eligible: boolean;
    scoringFrom: string; leftAt: string | null }[]
  reviews: readonly ReviewFact[]
  comments: readonly { id: string; reviewId: string; actorGithubUserId: number;
    bodyPresent: boolean; effective: boolean }[]
  headChanges: readonly { occurredAt: string; commitId: string }[]
  // Supply complete PR review history, including earlier seasons, for lifetime caps.
  reviewHistoryComplete: boolean
  headHistoryComplete: boolean
}
export type ScoreComponent = {
  id: string
  organizationId: string
  seasonId: string
  participantId: string
  pullRequestId: string
  pullRequestNumber: number
  pullRequestUrl: string
  reviewId: string
  reviewOutcome: ReviewOutcome
  occurredAt: string
  kind: ScoreKind
  points: number
  explanation: string
  sourceReference: string
  scoringPolicyVersion: "v1"
  status: "effective"
  creditBasis?: { kind: "initial_unconfigured"; observedAt: string }
}
export type ScoreReason = "scored" | "outside_season" | "before_team_entry" | "repository_not_authorized" |
  "participant_not_started" | "participant_departed" | "participant_excluded" | "participant_missing" |
  "author_excluded" | "self_review" | "ineffective_review" | "draft_review" | "closed_pr" | "credit_satisfied" |
  "fallback_cap" | "empty_comment_review" | "base_already_earned" | "follow_through_cap" |
  "no_new_commits" | "history_incomplete" | "readiness_unknown" | "credit_unknown" |
  "feedback_unknown" | "author_unknown" | "earlier_review_unresolved" | "head_history_unknown"
export type ScoreDecision = { reviewId: string; status: "scored" | "excluded" | "pending";
  reason: ScoreReason; explanation: string; points: number }
export type ScoreResult = { policyVersion: "v1"; status: "complete" | "pending";
  components: ScoreComponent[]; decisions: ScoreDecision[]; totalPoints: number;
  participantTotals: { participantId: string; points: number }[] }

const explanations: Record<ScoreReason, string> = {
  scored: "Qualified review work earned the listed score components.",
  outside_season: "This review occurred outside this season's start-inclusive, end-exclusive window.",
  before_team_entry: "Activity before the team's scoring start earns no retroactive points.",
  repository_not_authorized: "The repository was not included when this review occurred.",
  participant_not_started: "This activity predates the participant's scoring eligibility.",
  participant_departed: "This review occurred after the participant lost access.",
  participant_excluded: "The reviewer is not an eligible human participant.",
  participant_missing: "The reviewer's participant identity has not been resolved.",
  author_excluded: "Reviews of bot, service-account, or otherwise excluded authors do not score.",
  self_review: "Reviewing your own pull request does not score.",
  ineffective_review: "Deleted or otherwise ineligible reviews have no scoring effect; a dismissed approval retains earned credit.",
  draft_review: "The pull request was a draft when this review occurred.",
  closed_pr: "The pull request was already closed or merged when this review occurred.",
  credit_satisfied: "GitHub's review requirements were already satisfied before this review.",
  fallback_cap: "Without enforced requirements, only the first two unique eligible reviewers score.",
  empty_comment_review: "A comment-only formal review needs a summary or associated inline feedback.",
  base_already_earned: "A reviewer earns only one base score per pull request.",
  follow_through_cap: "The one follow-through bonus for this reviewer and pull request is already used.",
  no_new_commits: "Follow-through requires evidence of new PR commits after the qualifying review.",
  history_incomplete: "Complete PR review history is needed to enforce lifetime scoring caps.",
  readiness_unknown: "The PR's readiness at review time is not known; no state is guessed.",
  credit_unknown: "The review requirement state before this review is unknown; fallback is not assumed.",
  feedback_unknown: "Inline feedback has not been fully resolved for this review.",
  author_unknown: "The PR author's eligibility has not been resolved.",
  earlier_review_unresolved: "An earlier unresolved review may own a capped scoring opportunity.",
  head_history_unknown: "Commit history is incomplete, so follow-through cannot yet be established.",
}

function instant(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error("Scoring timestamps must be valid ISO timestamps with an explicit timezone")
  }
  return Date.parse(value)
}
function unique<T>(values: readonly T[], key: (value: T) => string, signature: (value: T) => string): T[] {
  const result = new Map<string, T>()
  for (const value of values) {
    const id = key(value)
    if (!id) throw new Error("Missing scoring fact identity")
    const existing = result.get(id)
    if (existing && signature(existing) !== signature(value)) throw new Error("Conflicting duplicate scoring facts")
    result.set(id, value)
  }
  return [...result.values()]
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

export function scorePullRequestV1(input: ScoringInput): ScoreResult {
  if (input.policyVersion !== "v1") throw new Error("Unsupported scoring policy version")
  if (![true, false, null].includes(input.pullRequest.authorEligible) ||
    !input.organizationId || !input.season.id || !input.pullRequest.id || !input.pullRequest.repositoryId) throw new Error("Invalid scoring scope")
  const start = instant(input.season.startsAt), end = instant(input.season.endsAt)
  const eligibleFrom = instant(input.season.eligibleFrom)
  if (start >= end) throw new Error("Invalid season interval")
  const access = input.repositoryAccess.map(period => {
    const from = instant(period.from), until = period.until === null ? Infinity : instant(period.until)
    if (from >= until) throw new Error("Invalid repository access interval")
    return { from, until }
  })
  const participants = unique(input.participants, p => String(p.githubUserId), p => JSON.stringify([
    p.id, p.githubUserId, p.eligible, instant(p.scoringFrom), p.leftAt === null ? null : instant(p.leftAt),
  ]))
  if (new Set(participants.map(p => p.id)).size !== participants.length) throw new Error("Conflicting participant identity")
  const actors = new Map(participants.map(p => [p.githubUserId, p]))
  for (const p of participants) {
    if (!p.id || !Number.isSafeInteger(p.githubUserId) || p.githubUserId <= 0 || typeof p.eligible !== "boolean") throw new Error("Invalid participant scoring fact")
  }
  const reviews = unique(input.reviews, r => String(r.githubReviewId), r => JSON.stringify([
    r.id, r.githubReviewId, r.actorGithubUserId, instant(r.occurredAt), r.outcome, r.bodyPresent,
    r.effective, r.approvalDismissed ?? false, r.commitId, r.url, r.readiness.state,
    r.readiness.state === "ready" ? instant(r.readiness.since) : null, r.creditBeforeReview, r.feedbackComplete,
    r.initialUnconfiguredObservation ?? null,
  ])).sort((a, b) => instant(a.occurredAt)-instant(b.occurredAt) || a.githubReviewId-b.githubReviewId)
  if (new Set(reviews.map(r => r.id)).size !== reviews.length) throw new Error("Conflicting review identity")
  for (const r of reviews) {
    if (!r.id || !r.commitId || !Number.isSafeInteger(r.githubReviewId) || r.githubReviewId <= 0 ||
      !Number.isSafeInteger(r.actorGithubUserId) || r.actorGithubUserId <= 0 ||
      typeof r.effective !== "boolean" || typeof r.bodyPresent !== "boolean" || typeof r.feedbackComplete !== "boolean" ||
      (r.approvalDismissed !== undefined && typeof r.approvalDismissed !== "boolean") ||
      (r.approvalDismissed === true && r.outcome !== "approved") ||
      !["ready", "draft", "closed", "unknown"].includes(r.readiness.state) ||
      !["approved", "changes_requested", "commented", "dismissed"].includes(r.outcome) ||
      !["required", "satisfied", "unconfigured", "unknown"].includes(r.creditBeforeReview)) throw new Error("Invalid review scoring fact")
    if (r.readiness.state === "ready" && instant(r.readiness.since) > instant(r.occurredAt)) throw new Error("Review predates its ready interval")
  }
  const comments = unique(input.comments, c => c.id, c => JSON.stringify([
    c.id, c.reviewId, c.actorGithubUserId, c.bodyPresent, c.effective,
  ]))
  const heads = input.headChanges.map(h => ({ at: instant(h.occurredAt), commitId: h.commitId }))
  const bases = new Map<number, ReviewFact>()
  const followThrough = new Set<number>()
  const result: ScoreResult = { policyVersion: "v1", status: input.reviewHistoryComplete ? "complete" : "pending", components: [], decisions: [], totalPoints: 0, participantTotals: [] }
  let firstQualifyingReview = true
  let unresolvedEarlier = false

  for (const review of reviews) {
    const at = instant(review.occurredAt), actor = actors.get(review.actorGithubUserId)
    const observation = review.initialUnconfiguredObservation
    const initialFallback = review.creditBeforeReview === "unknown" && observation != null &&
      observation.headSha === review.commitId && instant(observation.openedAt) <= at &&
      instant(observation.observedAt) >= at &&
      instant(observation.observedAt) - instant(observation.openedAt) <= 5 * 60 * 1000
    const credit = initialFallback ? "unconfigured" : review.creditBeforeReview
    function decide(reason: ScoreReason, status: ScoreDecision["status"] = "excluded", points = 0) {
      result.decisions.push({ reviewId: review.id, status, reason, explanation: explanations[reason], points })
      if (status === "pending") result.status = "pending"
    }
    function pending(reason: ScoreReason) { unresolvedEarlier = true; decide(reason, "pending") }
    if (at >= end) { decide("outside_season"); continue }
    if ((!review.effective && !review.approvalDismissed) || review.outcome === "dismissed") { decide("ineffective_review"); continue }
    if (review.actorGithubUserId === input.pullRequest.authorGithubUserId) { decide("self_review"); continue }
    if (input.pullRequest.authorEligible === false) { decide("author_excluded"); continue }
    if (actor && !actor.eligible) { decide("participant_excluded"); continue }
    if (actor?.leftAt && at >= instant(actor.leftAt)) { decide("participant_departed"); continue }
    if (review.readiness.state === "draft") { decide("draft_review"); continue }
    if (review.readiness.state === "closed") { decide("closed_pr"); continue }
    if (credit === "satisfied") { decide("credit_satisfied"); continue }
    if (!input.reviewHistoryComplete) { pending("history_incomplete"); continue }
    if (input.pullRequest.authorEligible === null) { pending("author_unknown"); continue }
    if (!actor) { pending("participant_missing"); continue }
    if (review.readiness.state === "unknown") { pending("readiness_unknown"); continue }
    if (credit === "unknown") { pending("credit_unknown"); continue }
    const feedback = review.bodyPresent || comments.some(c => c.reviewId === review.id &&
      c.actorGithubUserId === review.actorGithubUserId && c.effective && c.bodyPresent)
    if (!feedback && !review.feedbackComplete && review.outcome !== "changes_requested") { pending("feedback_unknown"); continue }
    if (review.outcome === "commented" && !feedback) { decide("empty_comment_review"); continue }
    if (unresolvedEarlier) { decide("earlier_review_unresolved", "pending"); continue }

    const base = bases.get(review.actorGithubUserId)
    const fallbackActors = [...bases.keys()].slice(0, SCORING_POLICY_V1.fallbackReviewers)
    if (credit === "unconfigured" && bases.size >= SCORING_POLICY_V1.fallbackReviewers &&
      !fallbackActors.includes(review.actorGithubUserId)) {
      decide("fallback_cap"); continue
    }
    const candidates: { kind: ScoreKind; points: number; explanation: string; slot: string }[] = []
    let reason: ScoreReason = "base_already_earned"
    if (!base) {
      bases.set(review.actorGithubUserId, review)
      const kind: ScoreKind = review.outcome === "changes_requested" ? "changes_requested" :
        review.outcome === "commented" ? "comment_review_with_feedback" : feedback ? "approval_with_feedback" : "approval"
      const values = { approval: SCORING_POLICY_V1.approval, approval_with_feedback: SCORING_POLICY_V1.approvalWithFeedback,
        comment_review_with_feedback: SCORING_POLICY_V1.commentReviewWithFeedback, changes_requested: SCORING_POLICY_V1.changesRequested }
      candidates.push({ kind, points: values[kind], slot: "base", explanation: {
        approval: "Approved a necessary review without feedback.", approval_with_feedback: "Approved with summary or associated inline feedback; comments do not stack.",
        comment_review_with_feedback: "Completed a necessary comment-only formal review with feedback.", changes_requested: "Found and communicated required changes.",
      }[kind] })
      if (firstQualifyingReview && review.readiness.state === "ready" && at-instant(review.readiness.since) > SCORING_POLICY_V1.agingThresholdHours*60*60*1000) {
        candidates.push({ kind: "aging_pr_rescue", points: SCORING_POLICY_V1.agingPrRescue, slot: "rescue", explanation: "Provided the first qualifying review after more than 24 continuous ready-for-review hours." })
      }
      firstQualifyingReview = false
    } else if (followThrough.has(review.actorGithubUserId)) reason = "follow_through_cap"
    else if (base.commitId === review.commitId) reason = "no_new_commits"
    else if (heads.some(h => h.at > instant(base.occurredAt) && h.at <= at && h.commitId === review.commitId)) {
      followThrough.add(review.actorGithubUserId)
      candidates.push({ kind: "follow_through", points: SCORING_POLICY_V1.followThrough, slot: "follow-through", explanation: "Returned after new PR commits while review credit remained open; no second base score." })
    } else if (!input.headHistoryComplete) { pending("head_history_unknown"); continue }
    else reason = "no_new_commits"

    // Resolve lifetime opportunities first, then project into this season/access
    // window. Resets, reinstallations, and late imports cannot farm the same PR.
    if (at < start || at >= end) { decide("outside_season"); continue }
    if (at < eligibleFrom) { decide("before_team_entry"); continue }
    if (!access.some(p => at >= p.from && at < p.until)) { decide("repository_not_authorized"); continue }
    if (at < instant(actor.scoringFrom)) { decide("participant_not_started"); continue }
    if (!candidates.length) { decide(reason); continue }
    for (const candidate of candidates) {
      result.components.push({ id: JSON.stringify(["v1", input.organizationId, input.pullRequest.id, actor.id, candidate.slot]),
        organizationId: input.organizationId, seasonId: input.season.id, participantId: actor.id,
        pullRequestId: input.pullRequest.id, pullRequestNumber: input.pullRequest.number, pullRequestUrl: input.pullRequest.url,
        reviewId: review.id, reviewOutcome: review.outcome, occurredAt: new Date(at).toISOString(), kind: candidate.kind,
        points: candidate.points, explanation: candidate.explanation + (initialFallback
          ? " Applied the two-reviewer fallback from the PR's initial no-requirements check." : ""), sourceReference: review.url,
        ...(initialFallback && { creditBasis: { kind: "initial_unconfigured" as const, observedAt: observation!.observedAt } }),
        scoringPolicyVersion: "v1", status: "effective" })
    }
    decide("scored", "scored", candidates.reduce((sum, c) => sum+c.points, 0))
  }
  const totals = new Map<string, number>()
  for (const c of result.components) totals.set(c.participantId, (totals.get(c.participantId) ?? 0)+c.points)
  result.participantTotals = [...totals].sort(([a], [b]) => compare(a,b)).map(([participantId, points]) => ({ participantId, points }))
  result.totalPoints = result.components.reduce((sum, c) => sum+c.points, 0)
  return result
}
