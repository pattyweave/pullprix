import { describe, expect, it } from 'vitest'
import suzukaAsset from '../../assets/tracks/suzuka-centerline.svg?raw'
import spaAsset from '../../assets/tracks/spa-francorchamps-centerline.svg?raw'
import interlagosAsset from '../../assets/tracks/interlagos-centerline.svg?raw'
import { SUZUKA, SPA, INTERLAGOS, CIRCUITS } from './circuits'
import { validateCircuit } from './path-geometry'

const assets: Record<string, string> = { suzuka: suzukaAsset, 'spa-francorchamps': spaAsset, interlagos: interlagosAsset }
type Point = [number, number]
function vertices(path: string): Point[] {
  return [...path.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(match => [Number(match[1]), Number(match[2])])
}
function crossingCount(points: Point[]) {
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  let count = 0
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue
      const a = points[i]!, b = points[(i + 1) % points.length]!, c = points[j]!, d = points[(j + 1) % points.length]!
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) count++
    }
  }
  return count
}

describe('prepared F1 circuits', () => {
  it.each([SUZUKA, SPA, INTERLAGOS])('$name is a closed, bounded, registered circuit matching its SVG asset', circuit => {
    expect(() => validateCircuit(circuit)).not.toThrow()
    expect(CIRCUITS[circuit.id]).toBe(circuit)
    const points = vertices(circuit.path)
    const [x, y, width, height] = circuit.viewBox
    expect(points.length).toBeGreaterThan(100)
    for (const [px, py] of points) {
      expect(px).toBeGreaterThanOrEqual(x)
      expect(px).toBeLessThanOrEqual(x + width)
      expect(py).toBeGreaterThanOrEqual(y)
      expect(py).toBeLessThanOrEqual(y + height)
      // The connected dashboard scales the padded SVG up to 1.28×. Retain
      // clearance for marker glow instead of clipping tightly cropped imports.
      const visibleHalf = width * 1.12 / (2 * 1.28)
      expect(Math.abs(px - (x + width / 2)) + 10).toBeLessThan(visibleHalf)
      expect(Math.abs(py - (y + height / 2)) + 10).toBeLessThan(visibleHalf)
    }
    const asset = assets[circuit.id]
    expect(asset).toContain(`d="${circuit.path}"`)
    // The seam is on the start straight, rather than an implicit long closing jump.
    expect(Math.hypot(points[0]![0] - points.at(-1)![0], points[0]![1] - points.at(-1)![1])).toBeLessThan(0.5)
  })
  it('retains only Suzuka’s intentional crossover, without offset loops or arrow detours', () => {
    expect(crossingCount(vertices(SUZUKA.path))).toBe(1)
    expect(crossingCount(vertices(SPA.path))).toBe(0)
    expect(crossingCount(vertices(INTERLAGOS.path))).toBe(0)
  })
  it.each([
    [SUZUKA, 1, -1], [SPA, -1, -1], [INTERLAGOS, -1, 1],
  ] as const)('$name leaves the start in the direction indicated by the source arrow', (circuit, dx, dy) => {
    const [start, next] = vertices(circuit.path)
    expect(Math.sign(next![0] - start![0])).toBe(dx)
    expect(Math.sign(next![1] - start![1])).toBe(dy)
  })
})
