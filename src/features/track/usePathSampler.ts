import { useMemo } from 'react'

export interface Point {
  x: number
  y: number
  /** Tangent angle in degrees at this point — useful for orienting markers. */
  angle: number
}

export interface PathSampler {
  /** Total length of the path in user units. */
  length: number
  /**
   * Position at normalized progress `t` (0..1), clamped. Returns coordinates in
   * the path's own viewBox space, plus the tangent angle for orientation.
   */
  pointAt: (t: number) => Point
}

/** Shared off-DOM SVG path element — created lazily, never rendered. */
let scratchPath: SVGPathElement | null = null

function getScratchPath(): SVGPathElement | null {
  if (typeof document === 'undefined') return null
  if (!scratchPath) {
    scratchPath = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    )
  }
  return scratchPath
}

/**
 * Turns an SVG path `d` string into a pure geometric sampler.
 *
 * Calculation is fully isolated from rendering: it measures the path with the
 * browser's native `getPointAtLength` (exact for any curve) and returns a
 * memoized `pointAt(t)`. The same `pointAt` primitive is what later powers
 * smooth animation — animate `t` per driver and re-sample each frame.
 */
export function usePathSampler(d: string): PathSampler {
  return useMemo<PathSampler>(() => {
    const el = getScratchPath()

    // SSR / no-DOM fallback: a degenerate sampler so callers never crash.
    if (!el) {
      return { length: 0, pointAt: () => ({ x: 0, y: 0, angle: 0 }) }
    }

    el.setAttribute('d', d)
    const length = el.getTotalLength()

    const pointAt = (t: number): Point => {
      // Wrap onto the loop so progress > 1 (multiple laps) keeps circulating
      // forward rather than pinning at the finish line.
      const wrapped = ((t % 1) + 1) % 1
      const at = wrapped * length
      const p = el.getPointAtLength(at)

      // Derive tangent from a nearby sample for orientation.
      const eps = Math.min(1, length * 0.001)
      const ahead = el.getPointAtLength((at + eps) % length)
      const angle = (Math.atan2(ahead.y - p.y, ahead.x - p.x) * 180) / Math.PI

      return { x: p.x, y: p.y, angle }
    }

    return { length, pointAt }
  }, [d])
}
