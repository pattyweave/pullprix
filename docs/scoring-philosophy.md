# Pull Prix Scoring Philosophy

Status: Approved for concierge MVP  
Policy version: `v1`  
Roadmap ticket: `PP-001`

## Purpose

Pull Prix exists to increase healthy participation in pull-request review by
making useful review work visible, recognized, and fun.

The scoring system rewards completing review responsibility while that work is
still useful to moving a pull request toward approval. It does not reward raw
GitHub activity, comment volume, speed for its own sake, or participation after
the necessary review work is already complete.

## Core principles

1. **Useful work beats visible activity.**
   Points represent review responsibility completed, not clicks, comments, or
   time spent in GitHub.

2. **Thoughtful intervention deserves more credit than a plain approval.**
   Requesting changes and leaving feedback indicate additional review effort.

3. **Necessary reviewers score; redundant reviewers do not.**
   Review credit closes when GitHub's configured approval requirements are
   satisfied.

4. **One thoughtful comment is enough.**
   Feedback can improve a review's value once. Additional comments never stack
   additional points.

5. **Following through matters.**
   A reviewer who returns after new commits and helps complete the review cycle
   may receive one follow-through bonus.

6. **Neglected work deserves attention.**
   The first necessary reviewer to rescue an aging, ready-for-review PR receives
   a small bonus.

7. **Scoring must be automatic.**
   Managers and developers do not configure point values, goals, thresholds, or
   review requirements inside Pull Prix.

8. **Scoring must be explainable and reversible.**
   Every point has a human-readable reason. Deleted or ineligible reviews remove
   their scoring effect. Every dismissal of an approval preserves earned review
   points: GitHub approval validity is separate from credit for work performed.

9. **Themes may reinterpret progress, but not rewrite facts.**
   Racing, gardening, construction, and future worlds consume the same
   canonical scoring outcomes.

10. **Standings are not employee-performance ratings.**
    Pull Prix recognizes a specific category of team contribution. It does not
    measure total engineering value, productivity, seniority, or performance.

## Eligible review

A review may score when all of the following are true:

- The pull request belongs to a repository included in the season.
- The pull request is marked ready for review.
- The review occurs during the active season.
- The reviewer is an eligible human participant.
- The reviewer is not the pull-request author.
- The review is a formal GitHub review with an outcome of approved, commented,
  or changes requested.
- Review work is still necessary under the review-credit window.
- The review has not been deleted. A later dismissal of an approval, automatic
  or manual, does not erase earned points or reset reviewer/PR scoring caps.

A reviewer does not need to have been formally requested. Pull Prix should
recognize eligible developers who proactively help.

## Review-credit window

Pull Prix awards championship points only while review work is still useful to
satisfying the PR's approval requirements.

### Repositories with GitHub review requirements

When GitHub exposes an applicable required-review state:

- Review credit remains open while GitHub considers review work required or
  changes requested.
- Review credit closes once GitHub considers the configured approval
  requirements satisfied.
- Reviews submitted after the requirements are satisfied earn no championship
  points.
- If GitHub invalidates stale approvals after new commits, review credit may
  reopen according to GitHub's current state.

Pull Prix follows GitHub's existing repository policy rather than asking the
customer to configure a second approval policy.

### Repositories without enforced review requirements

Pull Prix uses this automatic fallback:

- The first two unique eligible reviewers may earn a base review score.
- Later reviewers earn no championship points for that PR.

For a newly opened, unchanged PR, the first successful check may arrive after a
fast review. If that **first check** explicitly confirms no enforced requirements
within five minutes of PR creation, apply the same fallback to those initial
reviews. This is an initial-observation policy, not proof of historical rules.
Keep the real observation time with the award. Earlier unknown/enforced checks,
intervening PR changes, missing opening evidence, and older imports do not qualify.
Repositories with enforced or unreadable requirements still require prior evidence.

### Per-reviewer cap

Each reviewer may earn:

- One base review score per PR.
- One follow-through bonus per PR.

Submitting the same review outcome repeatedly does not create new base credit.

## Scoring table

| Qualified event | Points |
|---|---:|
| Approval without feedback | 8 |
| Approval with feedback | 10 |
| Comment-only formal review with feedback | 10 |
| Changes requested | 12 |
| Same reviewer follows through after new commits | +4 once |
| First necessary reviewer rescues a PR waiting over 24 hours | +3 once per PR |

## Feedback qualification

For scoring v1, a review contains feedback when it includes at least one of:

- A non-empty formal review summary.
- A non-empty inline diff comment associated with the review.

Feedback changes the review score at most once.

Examples:

- One inline comment and an approval: 10 points.
- Five inline comments and an approval: 10 points.
- One qualifying comment-only review: 10 points.
- Ten comments split across repeated submissions: still one base review score.

Pull Prix does not use comment length or comment quantity as a quality score.
The concierge pilots should monitor whether obviously meaningless feedback
becomes a material abuse pattern before adding more complicated qualification.

## Changes-requested treatment

A changes-requested review earns 12 points because it represents an explicit
finding that requires the author to act.

The premium over an approval is intentionally modest:

- It recognizes additional review effort.
- It should not make manufacturing blockers an attractive strategy.
- Comment quantity does not increase the score.
- The reviewer can earn base credit only once on the PR.
- Requesting changes does not guarantee the follow-through bonus.

Pull Prix should monitor unusual changes-requested rates during pilots as a
product-learning signal. An unusual rate is not, by itself, evidence of abuse.

## Follow-through bonus

The same reviewer may receive a four-point follow-through bonus when:

1. They previously submitted a qualifying review.
2. The author pushes new commits after that review.
3. Review credit is still open.
4. The same reviewer returns and submits another formal review.
5. They have not already earned the follow-through bonus on that PR.

The returning review does not earn another base score.

### Different reviewer completes the cycle

If Reviewer A requests changes, the author updates the PR, and Reviewer B
provides the necessary approval:

- Reviewer A receives 12 points for changes requested.
- Reviewer B receives the applicable 8- or 10-point approval score.
- Reviewer A receives no follow-through bonus because they did not return.

Reviewer B's work is eligible because review work was still necessary.

If Reviewer A returns first and provides the necessary follow-up:

- Reviewer A retains the original 12 points.
- Reviewer A receives the four-point follow-through bonus.
- Reviewer A does not receive a second base score.
- Later reviews do not score once GitHub's requirements are satisfied.

## Aging PR rescue bonus

The first necessary reviewer to submit a qualifying review after a ready PR has
waited more than 24 hours receives a three-point rescue bonus.

Rules:

- The PR must have been ready for review for more than 24 continuous hours.
- Draft time does not count toward the threshold.
- Only one rescue bonus is available per PR.
- The reviewer must otherwise be eligible for a base review score.
- Closing, reopening, or editing the PR must not manufacture a new rescue
  bonus.
- The bonus remains small so teams are not encouraged to delay fresh reviews.

## Streaks

Streaks do not affect championship points in scoring v1.

Specifically:

- No daily multiplier.
- No escalating `1.2x`, `1.3x`, or similar point boost.
- No penalty for breaking a streak.

There is no guarantee that an eligible PR exists every day. A daily multiplier
could reward availability rather than contribution, penalize leave or
part-time schedules, and encourage developers to delay work.

Streaks may remain visible and may unlock cosmetic effects, titles, or badges.

## Breadth and coverage

Reviewing across repositories, authors, or teams does not award championship
bonus points in scoring v1.

These behaviors may be recognized through:

- Badges.
- Profile statistics.
- Season recap awards.
- Manager-facing team-health metrics.

This avoids encouraging developers to review unfamiliar systems solely for
points.

## Shared seasonal progression

Customers do not configure team objectives.

A seasonal world may include automatic shared progression that requires no
setup. Examples:

- A racing team unlocks a constructors milestone.
- A group garden reaches a shared harvest.
- A team completes a level of a pyramid.

Shared progression is part of the authored season design, not a manager-created
goal system.

## PR outcome

Review points remain valid if the PR is later closed without merging.

The reviewer still performed the review work. Pull Prix does not make a
reviewer's credit depend on an author's later decision to merge, abandon, or
replace the PR.

Exceptions:

- Dismissed approvals retain earned credit, including manual dismissals. This
  does not excuse an independently discovered eligibility violation. A dismissed
  snapshot with no known original outcome is not assumed to have been approved.
- A deleted review loses its scoring effect.
- A review later determined to be ineligible is removed through deterministic
  recomputation.

## Pull-request size

PR size does not affect scoring v1.

Lines changed, file count, and commit count are unreliable proxies for review
difficulty. Pull Prix should collect no size multiplier during the concierge
MVP.

## Dependency updates

- PRs authored by recognized bots or service accounts do not score by default.
- Human-authored PRs that happen to update dependencies are treated like normal
  PRs.

Pull Prix does not need to infer the technical purpose of every human-authored
change.

## Activity that does not score

The following activity awards zero championship points:

- Reviews on draft PRs.
- Reviews after GitHub's approval requirements are satisfied.
- Reviews after the first two unique eligible reviewers in the fallback model.
- Self-reviews.
- Bot or service-account reviews.
- Reviews of bot-authored PRs.
- Reactions or emoji.
- General issue comments.
- Being requested as a reviewer.
- Opening or authoring a PR.
- Merging a PR.
- Additional individual comments.
- Comment length.
- Comment count.
- Changed lines inspected.
- PR size.
- Repeated submissions without new commits.
- A second follow-through review.
- Deleted reviews.
- Dismissal events themselves (no additional points; earned approval points stay).
- Activity outside the active season.
- Activity in repositories excluded from the season.
- Daily streaks.
- Repository, author, or team diversity.

## Examples

### Example 1 — Plain approval

A ready PR needs one approval. Ada reviews it and approves without leaving
feedback.

```text
Approval without feedback: 8
Total: 8
```

The review-credit window closes. Later reviewers receive zero points.

### Example 2 — Approval with several comments

A ready PR needs one approval. Mateo leaves four inline comments and approves.

```text
Approval with feedback: 10
Additional comments: 0
Total: 10
```

### Example 3 — Changes requested, then another reviewer approves

A ready PR needs two useful review decisions. Nadia requests changes. The author
pushes new commits. Yuki then approves without feedback.

```text
Nadia — Changes requested: 12
Yuki — Approval: 8
Nadia — Follow-through: 0
```

### Example 4 — Original reviewer follows through

Priya requests changes. The author pushes new commits. Priya returns and
approves before the review requirements are satisfied.

```text
Changes requested: 12
Follow-through: +4
Second base review: 0
Total: 16
```

### Example 5 — Aging PR rescue

A ready PR has received no qualifying review for 31 hours. Luca submits a
comment-only formal review with feedback.

```text
Commented review: 10
Aging PR rescue: +3
Total: 13
```

No later reviewer can receive another rescue bonus for the PR.

### Example 6 — Closed without merging

Ada earns 12 points for requesting necessary changes. The author later closes
the PR because the approach is abandoned.

```text
Review points retained: 12
```

### Example 7 — Dismissed review

Mateo earns 8 points for an approval. A maintainer later dismisses the review.

```text
Original approval: 8
Dismissal adjustment: 0
Final total from review: 8
```

This applies to both automatic stale-approval dismissals and manual maintainer
dismissals, as clarified on 2026-09-28. Another approval on the same PR cannot
earn another base; a genuinely qualifying follow-through can still earn +4.

### Example 8 — Repository without enforced approvals

A repository has no GitHub required-review rule. Three eligible developers
submit reviews in order.

```text
First unique reviewer: eligible
Second unique reviewer: eligible
Third unique reviewer: 0
```

Each eligible reviewer receives the score associated with their own review
outcome.

## Anti-abuse protections

### Comment spam

- Comments never score individually.
- Feedback changes a base score once.
- Repeated submissions do not create repeated base credit.

### Manufactured changes requests

- The changes-requested premium is small.
- Base credit is awarded once per reviewer per PR.
- Follow-through requires new commits and a still-open review need.
- Pilot monitoring tracks unusual behavior without automatically accusing
  participants.

### Redundant review farming

- Review scoring closes with GitHub's approval requirements.
- Repositories without requirements use a two-reviewer fallback.

### Review loops

- One base score and one follow-through bonus per reviewer per PR.
- Additional rounds remain visible as activity but do not create championship
  points.

### Collusion

- No peer-awarded points.
- No manually configured bonuses.
- Author-reviewer concentration may appear in pilot analysis.
- Pull Prix does not automatically treat concentration as wrongdoing.

### Easy-PR farming

- Bot-authored PRs are excluded.
- PR size does not affect points.
- Breadth is recognized through badges and statistics rather than score
  multipliers.
- Per-PR and review-credit-window caps limit repeated value extraction.

### Speed pressure

- No fastest-review points.
- No daily multiplier.
- The rescue bonus rewards neglected work rather than instantaneous response.

## Required score explanation

Every score transaction shown to a participant must include:

- PR identity and link.
- Review outcome.
- Base points.
- Applicable bonus.
- Human-readable reason.
- Effective or reversed status.

Example:

```text
pullprix/api #4823
Requested changes                           +12
Found and communicated required changes

Followed through after new commits           +4
Returned before the PR's review requirement was satisfied
```

## Pilot monitoring

The concierge pilot should monitor:

- Approval, commented, and changes-requested distribution.
- Changes-requested rate by participant and repository.
- Reviews per unique PR.
- Reviewer-author concentration.
- Number of reviews submitted after scoring closed.
- Frequency of feedback-bearing approvals.
- Follow-through frequency.
- Aging rescue frequency.
- Whether participants understand their scores.
- Whether anyone reports delaying, splitting, or changing review behavior to
  farm points.

These signals inform scoring v2. They should not silently change scoring during
an active season.

## Versioning

- Every season records its scoring-policy version.
- Scoring rules do not change during an active season.
- Canonical GitHub facts remain separate from scoring.
- Recalculation with the same policy must produce the same result.
- A later policy may change point values or eligibility without rewriting
  GitHub history.

## Approved v1 summary

```text
Approval without feedback                         8
Approval with feedback                           10
Comment-only formal review with feedback         10
Changes requested                                12
Same-reviewer follow-through after new commits   +4 once
First necessary review after 24 hours            +3 once per PR
```

Scoring closes when GitHub's review requirements are satisfied. If no required
review rule exists, only the first two unique eligible reviewers may earn base
points.
