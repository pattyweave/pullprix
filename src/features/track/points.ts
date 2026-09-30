/** Racing display scale shared by demo and live data; not a season-completion target. */
export const POINTS_PER_LAP = 90
export function pointsToLaps(points: number) {
  if (!Number.isFinite(points) || points < 0) throw new Error('Invalid track points')
  return points / POINTS_PER_LAP
}
