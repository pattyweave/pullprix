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
