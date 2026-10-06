# Track SVGs

Drop hand-authored circuit SVG files here (e.g. `monza.svg`).

These files are the **visual reference**. The TrackMap component does not import
them directly — it positions driver markers by sampling a path, so it needs the
path geometry as data.

## Adding a circuit

1. Save the SVG in this folder.
2. Open it and find the main racing-line `<path>`. Copy its `d` attribute and
   note the `viewBox`.
3. Add an entry to [`src/features/track/circuits.ts`](../../features/track/circuits.ts):

   ```ts
   export const MONZA: Circuit = {
     id: 'monza',
     name: 'Monza',
     viewBox: [0, 0, 1000, 560], // from the SVG's viewBox
     path: 'M…',                 // the path's d attribute (a closed loop)
     sectors: [],                // optional coloured overlays
   }
   ```

4. Pass it to `<TrackMap circuit={MONZA} drivers={…} />`.

The path should be a single closed loop. `progress: 0` maps to the path start
(the start/finish line) and `progress: 1` back to it.

## Local comparison (PP-095)

Run `npm run dev`, then open `http://127.0.0.1:5173/track-lab`.
The development-only lab uses sample drivers, with no team API reads. It compares
Jacarepaguá, Nova, and explicitly synthetic wide/tall/crossover geometry. Controls
cover September test scores, everyone at zero, multiple laps, shared positions,
a full-lap field offset, selection, and full-width previews. A browser-native
check compares rendered markers against each rendered path's geometry.

## Prepared circuits

Suzuka, Spa-Francorchamps and Interlagos are registered in `CIRCUITS` and exported
as `SUZUKA`, `SPA` and `INTERLAGOS`. The team dashboard defaults to Suzuka; the demo keeps its existing circuit.

- Original `*.svg` files remain untouched.
- `*-centerline.svg` contains one closed, continuous route without direction-arrow
  detours. Its path and source viewBox match `prepared-circuits.ts`.
- `*-alignment.svg` overlays the derived line on the original ribbon for review.
- `python3 scripts/prepare-track-centerlines.py` reproduces all generated assets
  using only the Python standard library. It checks source hashes first because
  the preparation recipe is specific to these files, not a generic SVG importer.

The recipe offsets the constant-width source ribbon by half its width, reconnects
Suzuka straight through the crossover, and simplifies to 0.12 SVG-unit tolerance.
Direction follows the source arrows. Display start/finish points are chosen on
the corresponding straights; these illustrations do not establish surveyed,
official timing-line coordinates. Suzuka has exactly one intentional crossing;
Spa and Interlagos have none. Paths are illustrations, not geographical datasets.

The lab compares 1,000 native path samples per new circuit against the original
filled ribbon and checks rendered marker positions independently. Its scenarios
cover ties, zero points, multiple laps, selection, and a full-lap field offset.
Topology, bounds, short closure seams, direction and SVG/data agreement also have
regression tests. The start stripe stays perpendicular to the local tangent.

For future imports:

- Identify a single closed racing **centerline**, not a filled ribbon outline,
  decoration, pit lane, or multiple disconnected paths.
- Flatten SVG/group transforms into coordinates and keep a matching viewBox.
- Confirm the path start, direction and crossover traversal.
- Use explicit `Z` closure and ordinary space-separated arc flags.
- Check markers, ties, wrapping, labels and framing at desktop and mobile widths.

The lab uses contain-fit with label/glow padding. All three tracks retain the
same source coordinate frame as Jacarepaguá (144 144 512 512). Bounds tests also
check marker clearance under the dashboard’s existing 1.28× maximum zoom.
No production circuit change or automatic season rotation is part of PP-095.

## Dashboard layout preview

`http://127.0.0.1:5173/track-lab/dashboard` renders the actual `LiveDashboard`
component with five sample participants, replay snapshots and a non-fetching
`ReviewQueueView`. Select any of the three new circuits or Jacarepaguá. The
extra preview toolbar consumes 48px; the dashboard viewport is reduced by that
amount rather than making the page scroll. No team API requests are made by
this fixture. The route and sample data are excluded from production builds.

Desktop and mobile Suzuka checks cover sidebar clearance, replay start/return
to live, and selecting a tied driver through mobile standings. Spa uses a
right-hand circuit title on desktop to avoid its upper straight. The team dashboard defaults to Suzuka. The selector changes only the local
preview; it does not set a team preference or season rotation.
