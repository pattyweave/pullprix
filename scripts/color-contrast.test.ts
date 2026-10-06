import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/index.css', 'utf8')

type RGB = [number, number, number]
const clamp = (value: number) => Math.max(0, Math.min(1, value))
const linear = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4

// Linear sRGB from OKLCH (OKLab inverse transform), then WCAG luminance.
// https://www.w3.org/TR/css-color-4/#color-conversion-code
// https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
function rgb(value: string): RGB {
  if (value.startsWith('#')) {
    return [1, 3, 5].map(index => linear(parseInt(value.slice(index, index + 2), 16) / 255)) as RGB
  }
  const match = value.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/)
  if (!match) throw new Error(`Unsupported contrast color: ${value}`)
  const lightness = Number(match[1]), chroma = Number(match[2]), hue = Number(match[3]) * Math.PI / 180
  const a = chroma * Math.cos(hue), b = chroma * Math.sin(hue)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ]
}

function ratio(foreground: RGB, background: RGB) {
  const luminance = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0]! + 0.05) / (values[1]! + 0.05)
}

function tintedSurface(color: RGB, background: RGB, alpha: number): RGB {
  const encoded = (value: number) => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
  return color.map((value, index) => linear(encoded(value) * alpha + encoded(background[index]!) * (1 - alpha))) as RGB
}

function palette(mode: 'dark' | 'light') {
  const blocks = [...css.matchAll(/(:root(?:\[data-color-mode='light'\])?) \{([^}]+)\}/g)]
  const tokens = new Map<string, string>()
  for (const [, , block] of blocks.filter(block => block[1] === ':root')) {
    for (const [, name, value] of block!.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens.set(name!, value!.trim())
  }
  if (mode === 'light') {
    const block = blocks.find(block => block[1] !== ':root')![2]!
    for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens.set(name!, value!.trim())
  }
  function resolve(name: string): string {
    const value = tokens.get(name)
    if (!value) throw new Error(`Missing palette token: ${name}`)
    const variable = value.match(/^var\((--[\w-]+)\)$/)
    return variable ? resolve(variable[1]!) : value
  }
  return { color: (name: string) => rgb(resolve(name)), resolve }
}

const surfaces = ['--pp-void', '--pp-surface', '--pp-surface-2']
const text = ['--pp-text', '--pp-text-dim', '--pp-text-faint', '--pp-race-text-faint',
  '--pp-success', '--pp-warning', '--pp-danger', '--pp-info', '--pp-accent', '--pp-notice-text',
  '--pp-rarity-common', '--pp-rarity-rare', '--pp-rarity-epic', '--pp-rarity-legendary',
  '--pp-team-blue', '--pp-team-red', '--pp-team-amber', '--pp-team-green', '--pp-team-violet', '--pp-team-pink',
  ...Array.from({ length: 8 }, (_, index) => `--pp-driver-${index + 1}`)]

describe.each(['dark', 'light'] as const)('%s palette contrast', mode => {
  it('keeps small text, signals, and driver identities readable on each surface', () => {
    const colors = palette(mode)
    const failures: string[] = []
    for (const foreground of text) for (const background of surfaces) {
      const contrast = ratio(colors.color(foreground), colors.color(background))
      if (contrast < 4.5) failures.push(`${foreground} on ${background}: ${contrast.toFixed(2)}:1`)
    }
    expect(failures).toEqual([])
  })

  it('keeps filled-button text and the circuit line legible', () => {
    const colors = palette(mode)
    expect(ratio(colors.color('--primary-foreground'), colors.color('--pp-accent'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(colors.color('--pp-track-line'), colors.color('--pp-track-ribbon'))).toBeGreaterThanOrEqual(3)
  })

  it('keeps selected standings readable on the driver-tinted surface', () => {
    const colors = palette(mode)
    const failures: string[] = []
    for (let index = 1; index <= 8; index++) for (const surface of surfaces) {
      const driver = colors.color(`--pp-driver-${index}`)
      const background = tintedSurface(driver, colors.color(surface), parseFloat(colors.resolve('--pp-selected-tint')) / 100)
      for (const foreground of [driver, colors.color('--pp-text'), colors.color('--pp-text-faint')]) {
        const contrast = ratio(foreground, background)
        if (contrast < 4.5) failures.push(`driver ${index} on ${surface}: ${contrast.toFixed(2)}:1`)
      }
    }
    expect(failures).toEqual([])
  })

  it('keeps generated large-roster identity colors readable across the hue wheel', () => {
    const colors = palette(mode), lightness = parseFloat(colors.resolve('--pp-driver-lightness')) / 100
    const saturation = 0.62
    // The actual fallback is HSL; sample every hue, including its brightest yellow.
    for (let hue = 0; hue < 360; hue++) {
      const channel = (n: number) => {
        const k = (n + hue / 30) % 12
        return lightness - saturation * Math.min(lightness, 1 - lightness) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
      }
      const color = [channel(0), channel(8), channel(4)].map(linear) as RGB
      for (const background of surfaces) {
        expect(ratio(color, colors.color(background)), `hue ${hue} on ${background}`).toBeGreaterThanOrEqual(4.5)
        expect(ratio(color, tintedSurface(color, colors.color(background), parseFloat(colors.resolve('--pp-selected-tint')) / 100)), `selected hue ${hue} on ${background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
