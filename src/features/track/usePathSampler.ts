import { useMemo } from 'react'
import { validateRacingLine } from './path-geometry'
export interface Point { x: number; y: number; /** Tangent angle in degrees. */ angle: number }
export interface PathSampler {
  /** Total length in SVG user units. */ length: number
  /** Unwrapped lap progress: 0 and every integer return to the start line. */ pointAt: (t: number) => Point
}
/** Each sampler owns its SVG element: mounting another circuit cannot change it. */
export function createPathSampler(d: string): PathSampler {
  validateRacingLine(d)
  if (typeof document === 'undefined') return { length: 0, pointAt: () => ({ x: 0, y: 0, angle: 0 }) }
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  el.setAttribute('d', d)
  const length = el.getTotalLength()
  if (!Number.isFinite(length) || length <= 0) throw new Error('Track racing line must have a positive, finite length.')
  return { length, pointAt(t) {
    if (!Number.isFinite(t)) throw new Error('Track progress must be finite.')
    const wrapped = ((t % 1) + 1) % 1
    const at = wrapped * length, p = el.getPointAtLength(at)
    const eps = Math.min(1, length * 0.001)
    const ahead = el.getPointAtLength((at + eps) % length)
    const angle = Math.atan2(ahead.y - p.y, ahead.x - p.x) * 180 / Math.PI
    if (![p.x, p.y, angle].every(Number.isFinite)) throw new Error('Track produced invalid coordinates.')
    return { x: p.x, y: p.y, angle }
  } }
}
/** Sample the browser's native SVG geometry; no approximation or position animation. */
export function usePathSampler(d: string): PathSampler {
  return useMemo(() => createPathSampler(d), [d])
}
