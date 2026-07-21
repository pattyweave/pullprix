# Pull Prix Review-Health Metrics

Status: Approved for concierge MVP  
Metric version: `v1`  
Roadmap ticket: `PP-003`

## Purpose

Pull Prix measures whether a season is increasing review participation,
spreading review responsibility, and reducing the time that ready pull requests
wait for attention.

The concierge MVP is not a general engineering analytics platform. It exposes a
small, opinionated set of metrics tied directly to the product's purpose.

## Measurement principles

1. Metrics require no customer configuration.
2. A ready PR waiting more than 24 elapsed hours is aging.
3. Useful review activity follows the approved scoring eligibility rules.
4. Team improvement is compared with an automatic pre-season baseline.
5. Metrics describe review behavior, not total engineering productivity.
6. Customer-facing language should emphasize positive team movement.
7. Definitions remain stable during an active season.
8. No AI-generated quality, sentiment, or productivity metrics are used.

## Shared terminology

### Useful review

For metrics v1, a useful review is a distinct reviewer–PR pair that qualifies
for a base review score under
[`docs/scoring-philosophy.md`](scoring-philosophy.md).

This means:

- The PR is ready for review.
- The reviewer is an eligible human participant.
- The reviewer is not the author.
- Review work is still necessary.
- The review is a qualifying formal GitHub review.
- The review has not been deleted or dismissed.

Follow-through bonuses do not create another useful-review count.

### Eligible roster

The eligible roster follows
[`docs/participant-eligibility.md`](participant-eligibility.md).

The initial roster is activity-derived from the 60 days before season launch.
New eligible participants may join automatically during the season.

### Measurement windows

Pull Prix uses fixed automatic windows:

| Window | Definition |
|---|---|
| Baseline | The 30 complete days immediately before the organization becomes score-eligible in the season |
| Current season | Organization score-eligibility timestamp through the current time |
| Recent trend | The most recent seven complete days |
| Finale | The complete season |

Managers and developers do not configure these windows.

For an organization already installed when a global season begins, its
score-eligibility timestamp is the global season start. For an organization
installing mid-season, it is the repository-access timestamp defined by
`docs/season-lifecycle.md`.

## Core metric 1 — Review participation

### Question answered

How much of the eligible team has joined the review effort?

### Formula

```text
unique eligible participants with ≥1 useful review
÷
eligible roster
```

### Display

```text
8 of 12 developers reviewed this season
67% participation
```

### Baseline comparison

For the baseline:

- Use the roster eligible when the organization enters the active season.
- Count how many of those participants completed at least one useful review
  during the 30-day baseline.

For the current season:

- Use the currently eligible roster.
- Include new participants after they join.

Display both counts and percentages so roster changes remain understandable.

### Exclusions

- Bot and service accounts.
- Noncoding spectators.
- Self-reviews.
- Redundant reviews after scoring closes.
- Draft PR reviews.
- Deleted or dismissed reviews.

## Core metric 2 — Review load spread

### Question answered

How much review work is reaching beyond the two busiest reviewers?

### Formula

```text
useful reviews completed by everyone except the two busiest reviewers
÷
all useful reviews
```

This is the positive inverse of top-two reviewer concentration.

### Display

```text
Review load spread

Before season    29%
Current season   52%

52% of reviews are now being completed beyond the two busiest reviewers.
```

Higher is better.

### Product usage

Use review load spread in:

- Manager review-health views.
- Season finale recaps.
- Internal pilot analysis.

Do not make it:

- A championship scoring input.
- A prominent individual HUD statistic.
- An employee-performance rating.

### Small-team behavior

Automatically omit review load spread when the eligible roster has fewer than
six participants. Two reviewers naturally represent too much of a very small
team for the percentage to be useful.

No customer setting is required.

### Internal companion metric

Pull Prix may retain top-two reviewer concentration internally:

```text
100% - review load spread
```

The customer-facing product should prefer the positive review-load-spread
language.

## Supporting metric — Individual review share

### Question answered

What percentage of the team's useful reviews did each participant complete?

### Formula

```text
participant's useful reviews
÷
all team useful reviews
```

### Display

```text
ADA
18 useful reviews
21% of team reviews
```

### Product usage

Individual review share may appear in:

- Standings.
- Participant profiles.
- Season recap statistics.
- Manager and developer views.

It does not award additional points.

### Rules

- Use the same useful-review definition as the team metrics.
- Show season-to-date share by default.
- Additional comments and follow-through events do not inflate the share.
- The shares across all participants should total approximately 100%, allowing
  for display rounding.
- A participant in the themed not-started state may display the seasonal label
  instead of `0%`.

For racing:

```text
On the Start Line
```

## Core metric 3 — Median time to first review

### Question answered

How long does a ready PR typically wait for its first useful review?

### Formula

For each qualifying PR:

```text
timestamp of first useful review
-
timestamp PR became ready for review
```

Report the median duration across the measurement window.

### Display

```text
Median first review

Before season    14h 42m
Current season    6h 18m
```

### Rules

- Use median, not average.
- Use ordinary elapsed time.
- Do not adjust for business hours, weekends, holidays, or timezones in v1.
- Draft time does not count.
- Closed PRs remain in historical calculations if they received a useful review
  while open.
- PRs that never received a review are represented by the aging-queue metric
  rather than assigned an artificial response duration.

## Core metric 4 — Aging review queue

### Question answered

How many ready pull requests have waited too long for their first useful review?

### Fixed threshold

```text
24 elapsed hours
```

This threshold is the same for every team and is not configurable in metrics
v1.

### Current formula

Count open PRs that:

- Are in selected repositories.
- Are ready for review.
- Are human-authored.
- Have waited more than 24 elapsed hours since becoming ready.
- Have not received a useful first review.

### Display

```text
3 PRs waiting over 24h
```

### Exclusions

- Draft PRs.
- Closed or merged PRs.
- Bot-authored PRs.
- PRs outside selected repositories.
- PRs that already received a useful first review.
- PRs currently waiting for an author to respond to requested changes.

### Baseline and finale comparison

A current aging-queue count is a point-in-time snapshot. For a fair baseline or
finale comparison, calculate:

```text
average daily aging-queue count during the measurement window
```

Display:

```text
Average PRs waiting over 24h

Before season    6.2
During season    2.7
```

Do not compare one current snapshot directly with a 30-day total.

### Scoring relationship

The same 24-hour definition powers the three-point aging PR rescue bonus in the
approved scoring policy.

## Core metric 5 — Useful reviews completed

### Question answered

How much qualifying review work occurred?

### Formula

```text
count of distinct useful reviewer–PR pairs
```

### Display

```text
84 useful reviews this season
```

### Rules

- Count one useful review per reviewer per PR.
- A follow-through review does not create another useful-review count.
- Additional comments do not create additional reviews.
- Reviews reversed through deletion, dismissal, or eligibility correction are
  removed.

### Comparison

The season-to-date total provides context but should not be compared directly
with a differently sized baseline window.

For trends, use a normalized weekly rate:

```text
useful reviews per seven days
```

Example:

```text
Useful reviews per week

Before season    17
Recent trend     24
```

## Core metric summary

| Metric | Primary purpose | Direction |
|---|---|---|
| Review participation | More developers join reviews | Higher is better |
| Review load spread | Work extends beyond the busiest two | Higher is better |
| Median time to first review | Ready PRs receive attention sooner | Lower is better |
| Aging review queue | Fewer PRs wait over 24 hours | Lower is better |
| Useful reviews completed | Provides review-volume context | Contextual |
| Individual review share | Shows each participant's portion of useful reviews | Contextual |

## Live product visibility

### Developer view

Developers may see:

- Review participation.
- Useful reviews completed.
- Individual review share.
- Current aging-queue count.
- Racing standings and seasonal progress.

### Manager view

Managers may additionally see:

- Review load spread.
- Median time to first review.
- Baseline comparisons.
- Recent seven-day trend.

### Finale

The finale may show the full team:

- Change in unique review participation.
- Change in review load spread.
- Change in median first-review time.
- Change in average daily aging queue.
- Useful reviews completed.
- Individual review shares and season awards.

Example:

```text
4 more developers joined the review effort
Review load spread increased from 29% to 52%
Median first review improved by 8h 24m
The average aging queue fell from 6.2 PRs to 2.7
84 useful reviews completed
```

Use language such as "during the Pull Prix season." Do not claim Pull Prix
definitively caused every observed change.

## Empty and edge states

### No useful reviews

- Participation is `0 of N`.
- Eligible racing participants display `On the Start Line`.
- Individual review share is not shown as `0%` when the seasonal state is more
  appropriate.
- Review load spread is unavailable.
- Median first review is unavailable.

### No ready PRs

Display:

```text
No PRs currently waiting for review
```

Do not imply an improvement when there was no review demand.

### Insufficient baseline

If Pull Prix cannot retrieve enough historical data:

- Show current metrics.
- Mark baseline comparison as unavailable.
- Do not manufacture a zero baseline.

### Roster changes

Show counts alongside percentages. New participants join the current
denominator after becoming eligible and are not retroactively inserted into the
pre-season baseline denominator.

## Metrics deliberately deferred

- Average comments per review.
- Lines changed or reviewed.
- PR-size-adjusted metrics.
- Approval rate as a health score.
- Changes-requested rate as a health score.
- Review sentiment.
- AI review-quality scoring.
- Individual productivity scoring.
- Business-hours-adjusted response time.
- Estimated engineering time saved.
- Author-reviewer network visualizations.
- Repository coverage scoring.
- Customer-configured targets.

Underlying facts may be retained when already required for scoring or pilot
analysis, but these are not product metrics v1.

## Approved v1 summary

```text
Baseline:
  Previous 30 complete days before organization score eligibility

Current:
  Organization score eligibility through current time

Recent trend:
  Previous seven complete days

Aging threshold:
  24 elapsed hours for every team

Team metrics:
  Review participation
  Review load spread
  Median time to first review
  Aging review queue
  Useful reviews completed

Participant metric:
  Individual share of useful team reviews

Configuration:
  None
```
