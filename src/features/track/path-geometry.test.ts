import { describe, expect, it } from 'vitest'
import { validateCircuit, validateRacingLine } from './path-geometry'
import { JACAREPAGUA, NOVA_CIRCUIT } from './circuits'
describe('circuit import contract', () => {
  it('accepts existing circuits, curves, relative commands, exponents and arcs', () => {
    expect(() => validateCircuit(JACAREPAGUA)).not.toThrow()
    expect(() => validateCircuit(NOVA_CIRCUIT)).not.toThrow()
    expect(() => validateRacingLine('m1e2 20 h30 v10 a5 5 0 0 1 -5 5 z')).not.toThrow()
  })
  it.each(['', 'M0 0 L10 10', 'L0 0 Z', 'M0 0 L10 Z', 'M0 0 M20 20 Z', 'M0 0 Z L10 10 Z', 'M0 0 X20 20 Z', 'M0 0 L1e999 2 Z', 'M0 0 A5 5 0 2 0 10 10 Z', 'M0 0 L10 10;Z'])('rejects malformed or discontinuous path %s', path => {
    expect(() => validateRacingLine(path)).toThrow()
  })
  it('rejects invalid coordinate bounds', () => {
    expect(() => validateCircuit({ ...NOVA_CIRCUIT, viewBox: [0, 0, 0, 500] })).toThrow()
    expect(() => validateCircuit({ ...NOVA_CIRCUIT, viewBox: [0, NaN, 1000, 500] })).toThrow()
  })
})
