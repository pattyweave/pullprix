import type { Circuit } from './circuits'

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }
/** Import contract: one explicitly closed racing line, without embedded transforms. */
export function validateRacingLine(d: string) {
  if (typeof d !== 'string' || !d.trim()) throw new Error('Track needs a racing-line path.')
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? []
  if (d.replace(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g, '').replace(/[\s,]/g, '') ||
    tokens[0]?.toUpperCase() !== 'M' || tokens.at(-1)?.toUpperCase() !== 'Z') {
    throw new Error('Track must be a single closed SVG path, starting with M and ending with Z.')
  }
  let moves = 0
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++]!.toUpperCase()
    if (command === 'Z') {
      if (i !== tokens.length) throw new Error('Track must contain one continuous loop, not multiple subpaths.')
      continue
    }
    const count = ARITY[command]
    if (!count) throw new Error(`Unsupported track path command: ${command}`)
    if (command === 'M' && ++moves > 1) throw new Error('Track must contain one continuous loop, not multiple subpaths.')
    const values: number[] = []
    while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]!)) values.push(Number(tokens[i++]))
    if (!values.length || values.length % count || values.some(value => !Number.isFinite(value))) throw new Error(`Invalid ${command} coordinates in track path.`)
    if (command === 'A') {
      for (let j = 0; j < values.length; j += 7) {
        if (values[j]! < 0 || values[j + 1]! < 0 || ![0, 1].includes(values[j + 3]!) || ![0, 1].includes(values[j + 4]!)) throw new Error('Invalid arc in track path.')
      }
    }
  }
}
export function validateCircuit(circuit: Circuit) {
  if (circuit.viewBox.length !== 4 || circuit.viewBox.some(value => !Number.isFinite(value)) || circuit.viewBox[2] <= 0 || circuit.viewBox[3] <= 0) {
    throw new Error('Track viewBox needs finite coordinates and positive width and height.')
  }
  validateRacingLine(circuit.path)
}
