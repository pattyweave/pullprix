import { featureFlags } from '../../config/feature-flags'

export type ColorMode = 'dark' | 'light' | 'system'
export type ResolvedColorMode = Exclude<ColorMode, 'system'>

export const COLOR_MODE_KEY = 'pull-prix:color-mode'

export function parseColorMode(value: string | null): ColorMode {
  return value === 'light' || value === 'system' ? value : 'dark'
}

export function readColorMode(): ColorMode {
  if (!featureFlags.colorMode) return 'dark'
  try {
    return parseColorMode(window.localStorage.getItem(COLOR_MODE_KEY))
  } catch {
    return 'dark'
  }
}

export function applyColorMode(mode: ColorMode, systemIsDark: boolean): ResolvedColorMode {
  const resolved = !featureFlags.colorMode ? 'dark' : mode === 'system' ? (systemIsDark ? 'dark' : 'light') : mode
  document.documentElement.dataset.colorMode = resolved
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0d0f10' : '#f5f7f4')
  return resolved
}
