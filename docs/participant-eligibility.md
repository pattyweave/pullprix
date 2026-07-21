# Pull Prix Participant Eligibility and Standings Policy

Status: Approved for concierge MVP  
Policy version: `v1`  
Roadmap ticket: `PP-002`

## Purpose

Pull Prix automatically creates a season roster from the people already doing
engineering work in the repositories selected during GitHub App installation.

The product does not ask managers to manually build a roster, invite every
developer, configure visibility, or decide who should compete. A team installs
Pull Prix, selects repositories, and receives a populated season.

## Product posture

Pull Prix is a workplace game built around an expected engineering
responsibility. Participation and standings are intentionally visible to the
team.

The product should not:

- Hide inactive participants to avoid showing that they have not reviewed.
- Add anonymous or private leaderboard modes.
- Ask managers to normalize scores around role, leave, or schedule.
- Present standings as a complete measure of engineering performance.
- Add customer configuration for ordinary roster management.

Privacy means that private organization activity remains inside the authorized
organization. It does not mean hiding the competition from its participants.

## Activity-derived roster

Pull Prix builds the initial roster from a 60-day lookback across the selected
repositories.

A human GitHub user is eligible when they performed at least one of these
activities during the lookback:

- Authored a pull request.
- Submitted a formal pull-request review.

Authorship is included deliberately. A developer who regularly creates PRs but
has not reviewed anyone else's work should still enter the season and begin in
the not-started state.

The 60-day lookback determines roster membership only. It does not award
championship points for activity that occurred before the season's scoring
start.

## Automatic additions during a season

A human GitHub user who was not present in the initial lookback joins
automatically when they first:

- Author a PR in a selected repository, or
- Submit a formal review in a selected repository.

They:

- Join in the not-started state unless their first qualifying activity is a
  scored review.
- Begin earning points only from eligible activity during the active season.
- Do not receive retroactive points from before the season.
- Require no manager invitation or roster update.

## Not-started state

Pull Prix stores a generic participant state such as:

```text
not_started
```

The active seasonal theme translates that state into its own language.

Examples:

| Theme | Not-started label |
|---|---|
| Racing | On the Start Line |
| Gardening | Ready to Plant |
| Pyramid construction | Awaiting First Block |

For the racing season, the standings should show **On the Start Line** instead
of displaying `0 points` as the participant's primary status.

Internally, the participant has zero championship points. The themed
presentation turns that neutral state into an invitation to begin rather than
an error, warning, or shame message.

Once the participant earns their first points, the ordinary season score and
position replace the not-started label.

## Included participants

### Engineers

Human developers who author or review PRs in selected repositories are included
automatically.

### Contractors and outside collaborators

Human contractors and outside collaborators are included when they actively
author or review PRs in selected repositories.

Pull Prix recognizes participation in the repository's engineering workflow; it
does not attempt to infer employment classification.

### Coding managers

Managers who author or review PRs participate under the same rules as everyone
else.

### Noncoding managers

Managers who have authorized organization access but no qualifying repository
activity may view the season and team-health information without occupying a
participant position.

## Automatically excluded accounts

- GitHub accounts identified as bots.
- Service and automation accounts.
- Pull Prix's own GitHub App identity.
- Deleted or suspended GitHub accounts.
- Humans with no qualifying activity in the selected repositories.

Bot-authored PRs are excluded from scoring under
[`docs/scoring-philosophy.md`](scoring-philosophy.md).

The concierge MVP may use an internal operator correction when GitHub metadata
misclassifies a service account. This is a support tool, not customer-facing
roster configuration.

## Standings visibility

Every authorized participant may see the full organization season standings.

Visible participant information may include:

- GitHub avatar and display identity.
- Seasonal identity.
- Position.
- Championship points after the participant starts.
- The themed not-started status before the participant starts.
- Reviews completed.
- Streaks.
- Badges and achievements.
- Recent standings movement.
- Scored contribution explanations.

Standings are visible only inside the authorized Pull Prix organization. They
are not publicly indexed or accessible through an unauthenticated URL.

Links to private pull requests remain protected by GitHub's existing repository
permissions. Pull Prix does not grant access to a PR that the signed-in user
cannot otherwise access.

## Individual opt-out

The concierge MVP does not provide:

- Individual standings opt-out.
- Anonymous participation.
- Hide-my-score controls.
- Private individual profiles.
- Manager-configured hidden participants.

The organization chooses to install Pull Prix for selected repositories.

Legally required access, correction, or deletion requests are handled through
the organization's data process and Pull Prix's deletion policy. They are not a
gameplay preference or leaderboard setting.

## Leaving during a season

When a participant loses relevant organization or repository access:

- They stop earning new points.
- Legitimately earned points remain in the season record.
- Their historical contribution is not rewritten.
- Their participant status becomes inactive.
- The current theme may present inactivity with neutral seasonal language.

A departed participant remains part of the completed season history unless
customer-data deletion requirements require otherwise.

## Leave, schedules, and job roles

Pull Prix does not normalize points for:

- Vacation or leave.
- Part-time schedules.
- On-call rotations.
- Job title.
- Seniority.
- Team assignment.
- The amount of review work naturally produced by a role.

The scoring policy reduces avoidable unfairness by excluding daily point
multipliers, inactivity penalties, PR-size weighting, and raw comment volume.

Standings describe contribution to one specific activity during one season.
They do not claim to measure a person's overall engineering value.

## Manager visibility

Managers see:

- The same standings visible to participants.
- Team-level review-health metrics.
- Unique reviewer participation.
- Reviewer concentration.
- Aging PRs.
- Repository coverage.
- Season-over-season team trends when available.

The concierge MVP does not create a hidden manager-only employee score or an
AI-generated individual productivity rating.

This is not intended to protect participants from seeing results. It preserves
one understandable game shared by the entire team.

## Installation model

Pull Prix is a centrally hosted SaaS.

The customer:

1. Installs the Pull Prix GitHub App.
2. Selects the organization repositories Pull Prix may access.
3. Returns to Pull Prix.

Pull Prix does not require the customer to:

- Create or maintain a Pull Prix repository in their organization.
- Commit generated score data.
- Configure GitHub Pages.
- Host Pull Prix infrastructure.
- Add workflow files to every repository.
- Manually add ordinary participants.

The production MVP preserves the simplicity of the original prototype while
moving storage, processing, and presentation into the Pull Prix service.

## Minimal data required

Pull Prix stores enough GitHub metadata to:

- Identify the organization, repositories, and human participants.
- Normalize pull requests and formal reviews.
- Calculate scores and standings.
- Produce score explanations.
- Enforce organization access.

The concierge MVP does not need repository source code to determine roster
eligibility.

## Examples

### Developer authors PRs but has not reviewed

Ada authored three PRs during the 60-day lookback and submitted no reviews.

Result:

```text
ADA — On the Start Line
```

Ada is visible when the organization enters the active season and begins
scoring with her first qualifying review.

### Developer only reviews

Mateo submitted formal reviews but authored no PRs during the lookback.

Result:

```text
Mateo joins the initial roster with points determined only by in-season reviews.
```

### New developer joins mid-season

Yuki was not active during the lookback. Two weeks into the season, Yuki authors
a PR in a selected repository.

Result:

```text
Yuki joins automatically — On the Start Line
```

### Contractor participates

Nadia is an outside collaborator who regularly authors and reviews PRs in a
selected private repository.

Result:

```text
Nadia participates normally.
```

### Noncoding manager views the season

Luca has manager access to Pull Prix but did not author or review a PR during
the lookback or active season.

Result:

```text
Luca may view the team but does not occupy a standings position.
```

### Participant leaves

Priya earns 82 points and then loses access to the organization before the
season ends.

Result:

```text
Priya stops scoring, retains 82 earned points, and is marked inactive.
```

## Approved v1 summary

```text
Initial roster:
  Human PR authors or formal reviewers
  Selected repositories
  Previous 60 days

New participants:
  Added automatically on first authored PR or formal review

Not started:
  Generic state translated by the active theme
  Racing label: "On the Start Line"

Visibility:
  Full standings visible inside the authorized organization

Opt-out:
  No ordinary individual opt-out or anonymous mode

Customer setup:
  Install GitHub App and select repositories
  No customer-owned Pull Prix repo or GitHub Pages deployment
```
