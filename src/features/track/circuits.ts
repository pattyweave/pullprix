/**
 * Circuit geometry as data — fully isolated from rendering.
 *
 * Each circuit is described by the `d` attribute of its racing-line path plus
 * the viewBox that path is authored in. The TrackMap component samples points
 * along `path` to position markers, so any circuit that follows this shape is
 * drop-in reusable.
 *
 * To use a hand-authored SVG: drop the file in `src/assets/tracks/` as a visual
 * reference, then copy its main `<path>`'s `d` string into a new entry here.
 */

export interface Circuit {
  id: string
  name: string
  /** viewBox the path coordinates are authored in: [minX, minY, width, height]. */
  viewBox: [number, number, number, number]
  /** The `d` attribute of the circuit's closed racing-line path. */
  path: string
  /** Optional coloured sector overlays (each a sub-path of the main line). */
  sectors?: { path: string; color: string }[]
}

/** Default placeholder circuit until a hand-authored SVG is supplied. */
export const NOVA_CIRCUIT: Circuit = {
  id: 'nova',
  name: 'Nova Circuit',
  viewBox: [0, 0, 1000, 560],
  path: 'M250,360 C180,250 250,120 400,130 C520,138 540,250 660,238 C780,226 770,120 860,170 C945,217 925,350 820,410 C700,478 470,470 360,440 C280,418 320,400 250,360 Z',
  sectors: [
    { path: 'M400,130 C520,138 540,250 660,238', color: 'var(--pp-success)' },
    { path: 'M820,410 C700,478 470,470 360,440', color: 'var(--pp-info)' },
  ],
}

/**
 * Jacarepaguá (Tour layout) — imported from a hand-authored SVG.
 * Source: src/assets/tracks/Jacarepagua Tour Vector.svg
 *
 * NOTE: the source art is a filled *ribbon outline* (it traces both edges of
 * the track), not a single centre line. Sampling the raw outline would send
 * markers along the kerb and double back, so `path` below is the centre line
 * derived from it; `outline` keeps the original art for the ribbon fill.
 */
export const JACAREPAGUA: Circuit = {
  id: 'jacarepagua',
  name: 'Jacarepaguá',
  viewBox: [144, 144, 512, 512],
  path: 'm609.8 349.44c-7.582-35.152-37.023-61.738-73.262-66.156l-42.551-5.1875c-12.113-1.4766-22.141-10.496-24.953-22.445-1.5234-6.4609-3.2852-13.277-5.2383-20.258-4.6484-16.617-18.039-29.23-34.945-32.922l-73-15.938c-2-0.43359-4.0391-0.65625-6.0703-0.65625-14.059 0-26.105 10.508-28.016 24.441-1.6094 11.73 0.43359 23.008 6.0742 33.523l60.836 113.35c6.1367 11.438 18.008 18.539 30.98 18.539 2.8789 0 5.7578-0.35938 8.5586-1.0625l112.23-28.141c1.4453-0.36328 2.9258-0.54688 4.3984-0.54688 8.8984 0 16.508 6.5859 17.699 15.32 1.9688 14.457-4.707 18.039-6.8984 19.215l-126.77 68.031-4.6562-9.1719-38.691 19.641-4.8516-1.3945-8.7617 14.09 10.547-5.3516 39.492-20.047 2.375 4.6758-107.3 57.586c-5.0898 2.7305-10.57 4.1172-16.285 4.1172-14.598 0-27.625-9.1836-32.414-22.852-7.8359-22.355-9.5391-40.344-4.9141-52.02l35.672-90.062c6.8516-17.297-1.1562-36.641-18.23-44.035-4.332-1.8789-8.9062-2.8281-13.59-2.8281-13.523 0-25.809 7.9805-31.305 20.336l-42.98 96.617c-7.4844 16.82-6.7812 35.77 1.9258 51.988l36.422 67.863c2.0508 3.8242 2.375 8.1797 0.91016 12.262-1.4648 4.0859-4.4844 7.2461-8.5 8.8906l-20.738 8.5039c-6.3477 2.6016-11.324 7.8047-13.641 14.266-2.3164 6.4609-1.7852 13.637 1.4609 19.684 4.2344 7.9023 12.441 12.809 21.41 12.809 3.9805 0 7.9414-1 11.465-2.8906l362.04-194.3c22.641-12.148 30.957-35.484 24.062-67.48z',
}

export const CIRCUITS: Record<string, Circuit> = {
  [NOVA_CIRCUIT.id]: NOVA_CIRCUIT,
  [JACAREPAGUA.id]: JACAREPAGUA,
}
