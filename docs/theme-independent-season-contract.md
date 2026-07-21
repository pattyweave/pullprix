# Pull Prix Theme-Independent Season Contract

Status: Approved for concierge MVP  
Contract version: `v1`  
Roadmap ticket: `PP-005`

## Purpose

Pull Prix must be able to ship a racing season, a gardening season, a pyramid
construction season, or a genuinely different future game without changing
how GitHub activity is ingested or how legitimate review work is scored.

The stable product boundary is:

```text
GitHub facts
  -> eligibility and scoring
  -> generic organization season snapshot
  -> versioned seasonal mechanic
  -> themed view model
```

Racing concepts such as drivers, laps, cars, grids, and podiums do not belong
in the canonical contribution or season tables.

## Product decisions

### One trustworthy championship score

Championship points are produced only by the versioned scoring policy.

A seasonal mechanic may:

- Turn points into movement, growth, construction, unlocks, or effects.
- Add automatic shared progression.
- Award badges and cosmetic achievements.
- React to generic events such as a participant scoring or a team reaching a
  milestone.

A seasonal mechanic may not:

- Reclassify a GitHub review as eligible or ineligible.
- Change the point value of a scored contribution.
- Apply a hidden point multiplier.
- Create a second competitive currency that replaces championship points.

If Pull Prix intentionally changes point values in a future season, that is a
new global `scoringPolicyVersion`, not theme presentation logic.

### Organization-local competition

Standings, ranks, ties, and co-champions are calculated within an organization.
The contract does not create a cross-company leaderboard.

Every organization receives the same global season package, but each team has
its own participants, points, progress, milestones, and final result.

### Reset seasonal competition, retain history

At each global boundary:

- Championship points reset to zero for the new season.
- Rank and seasonal progress reset.
- Theme-specific shared progress resets.
- Seasonal streak state resets.
- The completed season becomes immutable after finalization.
- Earned badges, trophies, and completed-season history remain on the
  participant profile.

Historical achievements are collectibles and do not grant points or gameplay
advantages in later seasons.

### Individual and shared play are both supported

Every season has individual standings. A season may additionally enable a
shared team mechanic.

Examples:

- Racing can emphasize individual position and optionally a constructors
  milestone.
- Gardening can grow individual plants and a shared garden.
- Pyramid construction can make the shared structure the visual centerpiece
  while retaining individual contribution standings.

Shared progression is authored by Pull Prix. Managers do not create targets or
configure objectives.

### Seasonal packs are versioned product code

A theme pack is a versioned code module plus a manifest and immutable assets.
It is not restricted to colors and labels. It may implement a distinctive,
deterministic game mechanic behind the stable interface in this document.

The concierge MVP does not include:

- A customer-facing theme editor.
- A no-code mechanic builder.
- Customer-selectable themes.
- Customer-authored goals.
- Customer-controlled scoring modifiers.

## Canonical domain language

The backend and public season API use these generic concepts:

| Generic concept | Racing | Gardening | Pyramid construction |
|---|---|---|---|
| participant | driver | gardener | builder |
| standings | championship | garden standings | builders' standings |
| championship points | points | growth points | contribution points |
| participant progress | track progress | plant growth | builder progress |
| team progress | constructors progress | shared garden | pyramid completion |
| milestone | checkpoint | growth stage | construction level |
| not started | on the start line | ready to plant | awaiting first block |
| final stage | final lap | final harvest | capstone phase |
| champion | champion | master gardener | master builder |

Theme vocabulary is presentation data. Generic enum values and identifiers are
stored in canonical records.

## TypeScript domain proposal

The following proposal defines the boundary, not a final storage schema.

```ts
type ISODateTime = string;
type SeasonId = string;
type OrganizationId = string;
type ParticipantId = string;
type ScoreContributionId = string;

type SeasonLifecycleState =
  | "scheduled"
  | "active"
  | "final_stage"
  | "finalizing"
  | "completed";

type ParticipantSeasonStatus =
  | "not_started"
  | "active"
  | "inactive";

interface GlobalSeasonDefinition {
  id: SeasonId;
  version: number;
  name: string;
  startsAt: ISODateTime;
  finalStageStartsAt: ISODateTime;
  endsAt: ISODateTime;
  scoringPolicyVersion: string;
  progressPolicy: ProgressPolicy;
  themePack: ThemePackReference;
}

interface ThemePackReference {
  id: string;
  version: string;
  assetBaseUrl: string;
  integrity: string;
}

interface ProgressPolicy {
  version: string;
  individualTargetPoints: number;
  teamTargetPointsPerStartingParticipant?: number;
  milestones: ProgressMilestoneDefinition[];
}

interface ProgressMilestoneDefinition {
  id: string;
  scope: "participant" | "team";
  threshold: number; // normalized 0..1 completion
}

interface OrganizationSeasonEntry {
  organizationId: OrganizationId;
  seasonId: SeasonId;
  eligibleFrom: ISODateTime;
  startingRosterSize: number;
  teamProgressTargetPoints?: number;
}

interface ScoreComponent {
  id: ScoreContributionId;
  participantId: ParticipantId;
  occurredAt: ISODateTime;
  kind:
    | "approval"
    | "approval_with_feedback"
    | "comment_review_with_feedback"
    | "changes_requested"
    | "follow_through"
    | "aging_pr_rescue"
    | "reversal";
  points: number;
  explanation: string;
  sourceReference: string;
  scoringPolicyVersion: string;
}

interface GenericProgress {
  points: number;
  targetPoints: number;
  normalized: number; // clamp(points / targetPoints, 0, 1)
  reachedMilestoneIds: string[];
}

interface Standing {
  participantId: ParticipantId;
  rank: number; // competition ranking: 1, 1, 3
  tied: boolean;
  points: number;
}

interface ParticipantSeasonSnapshot {
  participantId: ParticipantId;
  displayName: string;
  avatarUrl?: string;
  status: ParticipantSeasonStatus;
  points: number;
  rank?: number;
  tied: boolean;
  progress: GenericProgress;
  scoreComponents: ScoreComponent[];
  achievementIds: string[];
}

interface TeamSeasonSnapshot {
  progress?: GenericProgress;
  reachedMilestoneIds: string[];
  achievementIds: string[];
}

interface OrganizationSeasonSnapshot {
  contractVersion: "1";
  generatedAt: ISODateTime;
  lifecycleState: SeasonLifecycleState;
  season: GlobalSeasonDefinition;
  entry: OrganizationSeasonEntry;
  standings: Standing[];
  participants: ParticipantSeasonSnapshot[];
  team: TeamSeasonSnapshot;
}
```

`ScoreComponent` is an explainable projection of the canonical ledger. Theme
packs can display its generic `kind`, but they do not receive raw GitHub
payloads and cannot change its points.

## Automatic progress targets

Normalized progress exists for visual mechanics; it does not determine rank.
Rank always comes from championship points.

The global season definition authors an `individualTargetPoints` value. Every
participant in the same season uses that value. This makes generic progress
deterministic and comparable:

```ts
normalized = Math.min(points / individualTargetPoints, 1)
```

When shared progression is enabled, the organization target is created
automatically:

```ts
teamProgressTargetPoints =
  teamTargetPointsPerStartingParticipant * startingRosterSize
```

For a team entering after the global season begins, the target is prorated by
the fraction of the season remaining at `eligibleFrom`, with a floor defined
by the progress-policy version. The computed target is then locked for that
organization-season entry.

Later roster additions do not move the finish line backward. New participants'
points still contribute to shared progress. No manager input is required.

Reaching 100% does not freeze championship scoring or force tied standings.
Points and ranks continue changing; the theme may add post-completion effects
or repeatable celebrations.

## Theme-pack interface

```ts
interface ThemeVocabulary {
  participant: { singular: string; plural: string };
  standings: string;
  points: string;
  notStarted: string;
  inactive: string;
  finalStage: string;
  champion: { singular: string; plural: string };
}

interface ThemePack<TMechanicState, TViewModel> {
  manifest: {
    id: string;
    version: string;
    supportedContractVersion: "1";
    vocabulary: ThemeVocabulary;
  };

  deriveMechanicState(
    snapshot: Readonly<OrganizationSeasonSnapshot>,
  ): TMechanicState;

  buildViewModel(input: {
    snapshot: Readonly<OrganizationSeasonSnapshot>;
    mechanicState: Readonly<TMechanicState>;
  }): TViewModel;
}
```

Both functions must be deterministic. The same immutable snapshot and theme
version must produce the same state and view model.

Theme code may read:

- Generic points and normalized progress.
- Rank and tie state.
- Participant status.
- Generic milestone and achievement identifiers.
- Global lifecycle state and countdown timestamps.
- Generic score-component kinds for presentation effects.

Theme code may not read:

- Raw GitHub webhook payloads.
- Review text or private source code.
- Undocumented database tables.
- Customer-provided mechanic configuration.

## Seasonal mechanics and modifiers

The word `modifier` means a modifier to presentation or secondary seasonal
state in contract v1, not a championship point multiplier.

Allowed examples:

- A car receives a temporary visual boost after follow-through.
- A plant blooms when a participant crosses a milestone.
- A block receives a special material after an aging PR rescue.
- A shared structure unlocks a new section at 50% team progress.
- The final 72 hours change atmosphere and vocabulary.

Disallowed examples:

- `1.5x` championship points during the final stage.
- Re-scoring a changes-requested review inside one theme.
- Awarding championship points for clicking inside Pull Prix.
- Letting a manager choose an easier team-progress target.

The contract can add new generic, non-scoring event kinds later, but a theme
cannot invent canonical facts by itself.

## Achievements

An achievement definition belongs to the season package and uses generic,
deterministic criteria.

```ts
interface AchievementDefinition {
  id: string;
  scope: "participant" | "team";
  criterion:
    | { type: "progress_reached"; threshold: number }
    | { type: "milestone_reached"; milestoneId: string }
    | { type: "score_component_earned"; kind: ScoreComponent["kind"] }
    | { type: "season_rank"; ranks: number[] };
  presentationKey: string;
}
```

The backend records the stable achievement ID and season/theme version. The
theme supplies its name, artwork, description, and celebration.

Championship and co-champion achievements are finalized only after the season
enters `completed`.

## Example mappings

Given this generic participant snapshot:

```ts
{
  status: "active",
  points: 120,
  rank: 2,
  tied: false,
  progress: {
    points: 120,
    targetPoints: 200,
    normalized: 0.6,
    reachedMilestoneIds: ["participant_25", "participant_50"]
  }
}
```

### Racing pack

- Places the car at 60% of the authored track path.
- Uses rank `2` in the timing tower.
- Translates `not_started` to `On the Start Line`.
- Can trigger a theme effect when a new generic milestone is reached.

### Gardening pack

- Selects the 60% plant-growth state.
- Uses the same rank and points in garden standings.
- Translates `not_started` to `Ready to Plant`.
- Can combine team normalized progress into a shared garden state.

### Pyramid pack

- Uses participant progress for the builder's visible contribution.
- Uses team normalized progress for completed pyramid levels.
- Translates `not_started` to `Awaiting First Block`.
- Can celebrate milestone thresholds with new materials or structures.

No example changes the participant's 120 championship points.

## Historical rendering

A completed snapshot retains:

- Contract version.
- Season definition version.
- Scoring-policy version.
- Theme-pack ID and exact version.
- Progress-policy version and locked targets.
- Stable achievement and milestone IDs.

The corresponding theme assets and rendering code remain deployable so a past
season does not silently turn into the current theme.

If an old interactive renderer can no longer run safely, Pull Prix may serve an
immutable archived recap generated with that original version.

## Contract invariants

1. Scored facts exist before theme derivation.
2. A theme cannot alter points, eligibility, standings, or tie handling.
3. Rank is organization-local and based on championship points.
4. Normalized progress is monotonic and never determines rank.
5. Team targets are automatic and never customer-configured.
6. Theme outputs are deterministic for a snapshot and theme version.
7. Theme-specific nouns never enter canonical contribution records.
8. Historical results retain their original version references.
9. A new theme requires no change to GitHub webhook ingestion.
10. Customers receive the globally active package automatically.

## Concierge implementation boundary

For the first racing season, implementation only needs:

- The generic snapshot types.
- The approved scoring projection.
- Individual normalized progress.
- Optional automatic team progress.
- Standings with co-champion tie behavior.
- Racing vocabulary and track-position derivation.
- Version references sufficient to preserve the completed result.

PP-005 does not require the generalized seasonal authoring workflow. That work
belongs to `PP-074` after the first pack proves the contract.

## Approved v1 summary

```text
Canonical truth:
  GitHub facts -> scoring ledger -> generic season snapshot

Competition:
  Organization-local points, standings, ties, and co-champions

Theme freedom:
  Versioned code + manifest + assets behind a stable deterministic interface

Theme restrictions:
  Cannot alter eligibility, points, ranks, or canonical facts

Progress:
  Generic 0..1 individual and optional automatic team completion

Customer configuration:
  None

Historical result:
  Original contract, scoring, progress, theme, and asset versions retained
```
