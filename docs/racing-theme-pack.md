# Racing theme pack v1 — PP-046

The pack lives in `src/features/themes/racing.ts`, exported through
`src/features/themes/index.ts`. It implements the generic `ThemePack<State, View>`
interface with manifest ID `racing`, version `1.0.0`, and contract version `1`.
No racing state is added to canonical scoring tables.

## Integration

```ts
const mechanicState = racingThemePack.deriveMechanicState(snapshot)
const model = racingThemePack.buildViewModel({ snapshot, mechanicState })
// Existing controlled components:
// <TrackMap circuit={model.circuit} drivers={model.trackDrivers} />
// <TimingTower rows={model.timingRows} />
// <Badge {...model.drivers[0].badges[0]} />
```

The season definition must reference `racing@1.0.0`; incompatible references and
mixed replay frames are rejected. The pack consumes the PP-045 generic snapshot,
never raw GitHub payloads or private review bodies. Integration with the live
provider remains PP-060/061. This ticket does not switch the public demo provider,
publish a production global season, or choose production progress targets.

## Racing behavior

- Normalized progress maps directly onto the existing Jacarepaguá path. Zero is
  the starting line; one is a completed circuit. It does not wrap or reduce points.
  The mechanic state exposes completion separately from position.
- The manifest references the existing hand-authored SVG via the bundler's asset
  URL. Production imports receive content-hashed assets. No new artwork is needed.
- Driver color and cosmetic number derive only from participant ID, so name/rank
  changes and roster reordering do not change them. Numbers are cosmetic and can
  collide; participant ID remains the unique identity. Codes derive from display
  names; no nationality, GitHub handle, team affiliation or speed is fabricated.
- Tied ranks stay tied and first-place ties show “Joint lead.” Zero-point drivers
  have a null position and “On the Start Line.” The reusable timing tower now
  renders null rank as an em dash; existing numeric/demo rows behave identically.
- Lifecycle labels are On the Grid, Race in Progress, Final Lap, Results Pending,
  and Chequered Flag. Inactive drivers retain earned points and an inactive label.
- Pending scoring remains exposed through the view model.

## Pilot achievements

| Generic evidence | Racing badge |
| --- | --- |
| First effective base-review component | Off the Grid |
| Earned follow-through component | Pit Crew |
| Earned rescue component | Safety Car |
| Normalized progress reaches one | Full Circuit |
| Finalized champion achievement | Champion |
| Finalized shared championship | Co-Champion |

Badges are deterministic cosmetic projections. They never award points or reward
speed. Component-based badges use the source activity timestamp; other badges
omit an unlock time rather than inventing one. Reversals remove invalid earned
badges when the corrected snapshot removes their evidence. Championship badges
require both completed lifecycle and the generic championship achievement.
Persistence of achievement records belongs to the season lifecycle integration.
The demo profile's unsupported speed/depth statistics are not populated.

A gardening example in tests implements the same interface using normalized
plant growth, proving that neither the snapshot nor scoring needs racing fields.
It is a compatibility fixture, not a second production theme.

## Verification — 2026-09-28

300 application tests pass, including 11 racing-pack tests for circuit mapping,
identity stability, shared ranks, zero-point states, earned badges, reversals,
completion, finalization, inactive drivers, version checks and a second theme.
Tests render the actual timing tower and badge components with pack output.
The production TypeScript/Vite build passes. Lint passes with only existing
frontend refresh warnings; the pre-existing bundle-size warning remains.

No database migration, Supabase deployment or score mutation was needed. Public
landing/demo data and routes remain unchanged. No infrastructure was added.
