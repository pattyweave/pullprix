# Pull Prix Global Season Lifecycle

Status: Approved for concierge MVP  
Lifecycle version: `v1`  
Roadmap ticket: `PP-004`

## Purpose

Pull Prix is a globally operated live-service game. Customers install the
GitHub App and enter the season that is already running.

Managers and developers do not choose:

- When a season starts.
- How long it lasts.
- Which theme is active.
- Which mechanics are enabled.
- Which scoring policy is used.
- When the season ends.

The lack of configuration is intentional. A new season is a Pull Prix product
release shared by every organization at the same time.

## Authoritative global schedule

Every season begins:

```text
First Monday of the month at 12:00 UTC
```

Every season ends:

```text
First Monday of the following month at 12:00 UTC
```

The end of one season is the start of the next season.

Season lengths naturally vary:

- Some seasons last 28 days.
- Some seasons last 35 days.

The calendar controls the duration. Customers do not configure or override it.

## Global synchronization

All Pull Prix organizations receive the same:

- Active season.
- Theme.
- Seasonal mechanics.
- Scoring-policy version.
- Start timestamp.
- End timestamp.
- Final-stage timestamp.
- Next-season activation timestamp.

Organizations do not remain on older themes or start independent copies of a
season.

Historical seasons retain their original theme version and assets so completed
results remain viewable after the live product changes.

## Lifecycle states

```text
Scheduled → Active → Final Stage → Finalizing → Completed
                 ↘ next season activates immediately ↗
```

The previous season may be finalizing while the new season is already active.

### Scheduled

A season package has been deployed and validated but its global start timestamp
has not arrived.

The package includes:

- Season identifier and version.
- Theme identifier and version.
- Theme assets and vocabulary.
- Progress mapping.
- Achievements and seasonal mechanics.
- Scoring-policy version.
- Start and end timestamps.
- Final-stage timestamp.

Customers cannot preview, select, delay, or activate the scheduled season.
Marketing may reveal upcoming content separately.

### Active

At the first-Monday 12:00 UTC boundary:

- The season becomes active globally.
- Its scoring policy becomes authoritative.
- Eligible GitHub activity begins scoring into the new season.
- The previous season stops accepting activity that occurred after the
  boundary.
- Every organization sees the newly active theme.

No manager action is required.

### Final Stage

The final 72 hours of the active season use a theme-specific final-stage
presentation.

Examples:

| Theme | Final-stage label |
|---|---|
| Racing | Final Lap |
| Gardening | Final Harvest |
| Pyramid construction | Capstone Phase |

The final stage:

- Makes the countdown and season conclusion more prominent.
- May change presentation, audio, animations, or narrative.
- Does not change point values.
- Does not add a multiplier.
- Does not alter review eligibility.
- Requires no customer configuration.

### Finalizing

At the season-end timestamp:

- Activity occurring at or after the boundary belongs to the new season.
- Activity occurring before the boundary remains eligible for the prior season
  even if its webhook arrives late.
- The prior season standings become provisional.
- Pull Prix processes delayed events and performs reconciliation.

The finalization target is:

```text
Up to 24 hours
```

Finalization never blocks the next season from beginning.

### Completed

After finalization:

- Final standings are recorded.
- Co-champions are recorded when applicable.
- Badges and achievements finalize.
- The team-health recap becomes available.
- Score explanations remain viewable.
- The season becomes historical and read-only.
- The original theme version remains available for presentation.

Operational corrections for invalid or missing data may still occur through a
documented support process. Ordinary new GitHub activity cannot alter a
completed season.

## Installation during an active season

A team joining mid-season enters immediately.

The customer flow is:

1. Install the Pull Prix GitHub App.
2. Select repositories.
3. Return directly to the current global season.

There is no:

- Waiting for a manager to launch.
- Team-specific preseason.
- Season setup wizard.
- Theme selection.
- Duration selection.
- Scoring configuration.

While Pull Prix prepares the roster and historical baseline, the product may
show:

```text
Welcome to the Championship
Preparing your team's starting grid…
```

Participants appear as they are discovered.

## Mid-season scoring start

For a newly installed organization:

- Historical activity may build the 60-day roster.
- Historical activity may build the 30-day health baseline.
- Historical activity does not award current-season championship points.
- Scoring begins when Pull Prix receives repository access for the
  organization.
- Only qualifying activity occurring after that access timestamp may score.

The team competes for the time remaining in the global season.

If a team installs near the end of a season, it still enters immediately. The
global countdown makes the remaining time clear, and the team rolls into the
next season automatically.

## Event boundary rule

Season assignment uses the GitHub activity occurrence timestamp, not the time
Pull Prix processes the event.

```text
Occurred before global boundary  → previous season
Occurred at global boundary      → new season
Occurred after global boundary   → new season
```

Delayed delivery does not move legitimate activity into the wrong season.

Every season uses a half-open interval:

```text
[start_at, end_at)
```

An event exactly equal to `end_at` belongs to the next season.

## New participant during a season

Participant behavior follows
[`docs/participant-eligibility.md`](participant-eligibility.md).

A newly eligible human:

- Joins automatically.
- Enters the active theme's not-started state.
- Begins scoring from qualifying in-season activity.
- Receives no retroactive championship points.
- Requires no manager action.

For racing, the not-started state is:

```text
On the Start Line
```

## Repository added during a season

When GitHub grants access to another repository:

- Pull Prix begins ingestion for that repository.
- Eligible participants are discovered automatically.
- Activity occurring after access was granted may score.
- Earlier activity may inform roster or baseline data when appropriate.
- Earlier activity does not receive retroactive championship points.
- The organization remains in the same global season.

## Repository removed during a season

When repository access is removed:

- New activity from that repository stops scoring.
- Legitimately earned points remain.
- Existing score explanations remain available subject to data-retention
  policy.
- The season is not restarted or recalculated as though the repository never
  participated.

## Participant leaves during a season

Behavior follows the participant policy:

- New activity stops scoring when access is lost.
- Earned points remain.
- Historical contribution is retained.
- The participant becomes inactive.

## Installation interruption

A suspended installation or Pull Prix processing interruption does not pause
the global season clock.

After recovery:

- Pull Prix reconciles qualifying GitHub activity.
- Activity is assigned by occurrence timestamp.
- Eligible activity that occurred during the active season may still score.
- Activity after the season boundary belongs to the next season.

Customers do not receive a pause control.

## Tie handling

Exact point ties produce shared positions and co-champions.

```text
1  ADA   184
1  RIV   184
3  TAN   172
```

Pull Prix does not use:

- Review speed.
- Changes-requested count.
- Comment count.
- PR size.
- Review quantity.
- Arbitrary ordering.

as a tie-breaker.

A shared championship is a valid season outcome.

## No intermission

There is no gap between active seasons.

At the global boundary:

- The new season begins immediately.
- The old season enters finalization.
- The live product changes to the new season.
- The old season remains accessible through history after finalization.

The product may present a transition or reveal animation, but it cannot delay
scoring in the new season.

## Customer controls deliberately omitted

Customers cannot:

- Start a season.
- Pause a season.
- End a season.
- Extend a season.
- Select a theme.
- Remain on an old theme.
- Select a scoring policy.
- Change the global reset time.
- Configure the final stage.
- Delay the next season.

The GitHub App installation and repository selection are the only required
customer setup for ordinary operation.

## Time display

The authoritative reset timestamp is 12:00 UTC on the first Monday.

The product may display the countdown and timestamp in the viewer's local
timezone, but all season assignment and transition logic uses UTC.

## Examples

### Team installs halfway through a season

The global season runs from August 3 at 12:00 UTC through September 7 at
12:00 UTC. A team installs on August 20.

Result:

- The team enters the August season immediately.
- Roster and baseline history are prepared.
- Scoring begins from repository authorization on August 20.
- The team receives no points for August 3–19.
- The team automatically enters the September season on September 7.

### Review arrives late

A review occurs at 11:58 UTC before the reset. Its webhook is processed at
12:04 UTC after the reset.

Result:

```text
The review belongs to the previous season.
```

### Review occurs at reset

A review occurs exactly at 12:00 UTC on the first Monday.

Result:

```text
The review belongs to the new season.
```

### Previous season is still finalizing

The new season begins while two delayed review events from the previous season
are still processing.

Result:

- New activity scores into the new season immediately.
- Delayed old activity updates provisional prior-season results.
- Prior results finalize within the 24-hour target.

### Exact tie

Ada and Mateo both finish with 184 points.

Result:

```text
Ada and Mateo are co-champions.
```

## Approved v1 summary

```text
Schedule:
  First Monday 12:00 UTC
  through next first Monday 12:00 UTC

Synchronization:
  One global live season for every organization

Customer controls:
  None beyond GitHub App installation and repository selection

Mid-season installation:
  Join immediately
  Score from repository-access timestamp
  No retroactive championship points

Final stage:
  Last 72 hours
  Presentation only

Transition:
  Next season begins immediately
  Previous season finalizes in parallel for up to 24 hours

Ties:
  Shared positions and co-champions

Historical seasons:
  Read-only and permanently viewable with original theme version
```
