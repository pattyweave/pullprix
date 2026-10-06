// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createPathSampler } from './usePathSampler'
afterEach(() => vi.restoreAllMocks())
function geometry(lengthOverride?: number) {
  const original = document.createElementNS.bind(document)
  const elements: Element[] = []
  vi.spyOn(document, 'createElementNS').mockImplementation(((namespace: string, name: string) => {
    const el = original(namespace, name)
    if (name === 'path') {
      elements.push(el)
      Object.assign(el, {
        getTotalLength: () => lengthOverride ?? (el.getAttribute('d')!.includes('100') ? 100 : 200),
        getPointAtLength: (at: number) => ({ x: at, y: el.getAttribute('d')!.includes('100') ? 10 : 20 }),
      })
    }
    return el
  }) as typeof document.createElementNS)
  return elements
}
it('owns independent path geometry when multiple maps mount or one changes', () => {
  const elements = geometry()
  const a = createPathSampler('M0 0 H100 V10 Z'), before = a.pointAt(.25)
  const b = createPathSampler('M0 0 H200 V20 Z')
  expect(a.pointAt(.25)).toEqual(before)
  expect(b.pointAt(.25)).toMatchObject({ x: 50, y: 20 })
  expect(elements).toHaveLength(2)
  expect(elements[0]).not.toBe(elements[1])
})
it('wraps whole laps and negative offsets, rejecting non-finite progress', () => {
  geometry()
  const sampler = createPathSampler('M0 0 H100 V10 Z')
  expect(sampler.pointAt(0)).toEqual(sampler.pointAt(2))
  expect(sampler.pointAt(.25)).toEqual(sampler.pointAt(2.25))
  expect(sampler.pointAt(-.25)).toEqual(sampler.pointAt(.75))
  expect(() => sampler.pointAt(NaN)).toThrow()
  expect(() => sampler.pointAt(Infinity)).toThrow()
})

it('rejects degenerate paths after native measurement', () => {
  geometry(0)
  expect(() => createPathSampler('M0 0 L0 0 Z')).toThrow(/positive, finite length/)
})
