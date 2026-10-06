// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COLOR_MODE_KEY } from './appearance'
import { ColorModeProvider } from './ColorModeProvider'
import { ColorModeSelect } from './ColorModeSelect'
import html from '../../../index.html?raw'

vi.mock('../../config/feature-flags', () => ({ featureFlags: { colorMode: true } }))

const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)![1]!.replaceAll('__COLOR_MODE_ENABLED__', 'true')
let media: MediaQueryList

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  delete document.documentElement.dataset.colorMode
  document.head.innerHTML = '<meta name="theme-color" content="#0d0f10">'
  const events = new EventTarget()
  media = {
    matches: false,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn(events.addEventListener.bind(events)),
    removeEventListener: vi.fn(events.removeEventListener.bind(events)),
    dispatchEvent: events.dispatchEvent.bind(events),
  } as unknown as MediaQueryList
  vi.stubGlobal('matchMedia', vi.fn(() => media))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function start() {
  return render(<StrictMode><ColorModeProvider><ColorModeSelect /><StatefulDashboard /></ColorModeProvider></StrictMode>)
}

function StatefulDashboard() {
  const [day, setDay] = useState(0)
  return <button onClick={() => setDay(day + 1)}>Replay day {day}</button>
}

function choose(mode: string) {
  fireEvent.change(screen.getByLabelText('Color mode'), { target: { value: mode } })
}

function systemDark(matches: boolean) {
  Object.defineProperty(media, 'matches', { value: matches, configurable: true })
  act(() => { media.dispatchEvent(new Event('change')) })
}

function runBootstrap() {
  // Exercise the actual pre-paint HTML script, not a copy of its logic.
  new Function('window', 'document', 'localStorage', bootstrap)(window, document, localStorage)
}

describe('color mode', () => {
  it('keeps dark as the default even when the OS is light', () => {
    start()
    expect((screen.getByLabelText('Color mode') as HTMLSelectElement).value).toBe('dark')
    expect(document.documentElement.dataset.colorMode).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(COLOR_MODE_KEY)).toBeNull()
  })

  it('persists explicit choices without resetting dashboard state, and restores after remount', () => {
    start()
    fireEvent.click(screen.getByText('Replay day 0'))
    choose('light')
    expect(document.documentElement.dataset.colorMode).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#f5f7f4')
    expect(localStorage.getItem(COLOR_MODE_KEY)).toBe('light')
    expect(screen.getByText('Replay day 1')).toBeTruthy()
    systemDark(true)
    expect(document.documentElement.dataset.colorMode).toBe('light')
    cleanup()
    start()
    expect((screen.getByLabelText('Color mode') as HTMLSelectElement).value).toBe('light')
    choose('dark')
    expect(document.documentElement.dataset.colorMode).toBe('dark')
    expect(localStorage.getItem(COLOR_MODE_KEY)).toBe('dark')
  })

  it('follows OS changes only in System mode and cleans up listeners under StrictMode', () => {
    const view = start()
    choose('system')
    expect(document.documentElement.dataset.colorMode).toBe('light')
    systemDark(true)
    expect(document.documentElement.dataset.colorMode).toBe('dark')
    expect(localStorage.getItem(COLOR_MODE_KEY)).toBe('system')
    choose('dark')
    systemDark(false)
    expect(document.documentElement.dataset.colorMode).toBe('dark')
    view.unmount()
    expect(vi.mocked(media.removeEventListener).mock.calls.length).toBe(vi.mocked(media.addEventListener).mock.calls.length)
  })

  it('syncs changes and resets from other tabs without accepting unrelated storage', () => {
    start()
    const notify = (key: string | null, newValue: string | null, storageArea = localStorage) => {
      act(() => { window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea })) })
    }
    notify('unrelated', 'light')
    notify(COLOR_MODE_KEY, 'light', sessionStorage)
    expect(document.documentElement.dataset.colorMode).toBe('dark')
    notify(COLOR_MODE_KEY, 'light')
    expect(document.documentElement.dataset.colorMode).toBe('light')
    notify(null, null)
    expect(document.documentElement.dataset.colorMode).toBe('dark')
  })

  it('switches modes even when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    runBootstrap()
    start()
    expect(document.documentElement.dataset.colorMode).toBe('dark')
    choose('light')
    expect(document.documentElement.dataset.colorMode).toBe('light')
  })

  it.each([
    [null, false, 'dark'],
    ['invalid', false, 'dark'],
    ['dark', false, 'dark'],
    ['light', true, 'light'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
  ] as const)('applies %s with OS dark=%s before React starts', (saved, osDark, resolved) => {
    if (saved !== null) localStorage.setItem(COLOR_MODE_KEY, saved)
    systemDark(osDark)
    runBootstrap()
    expect(document.documentElement.dataset.colorMode).toBe(resolved)
    expect(document.documentElement.classList.contains('dark')).toBe(resolved === 'dark')
    start()
    expect(document.documentElement.dataset.colorMode).toBe(resolved)
  })
})
