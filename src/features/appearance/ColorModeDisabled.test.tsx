// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import html from '../../../index.html?raw'
import { featureFlags } from '../../config/feature-flags'
import { COLOR_MODE_KEY } from './appearance'
import { ColorModeProvider } from './ColorModeProvider'
import { ColorModeSelect } from './ColorModeSelect'
import { useColorMode } from './context'

const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)![1]!.replaceAll('__COLOR_MODE_ENABLED__', JSON.stringify(featureFlags.colorMode))

beforeEach(() => {
  localStorage.clear()
  const original = new DOMParser().parseFromString(html, 'text/html')
  document.documentElement.className = original.documentElement.className
  document.documentElement.dataset.colorMode = original.documentElement.dataset.colorMode
  document.head.innerHTML = '<meta name="theme-color" content="#0d0f10">'
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

function InternalControl() {
  const { mode, setMode } = useColorMode()
  return <button onClick={() => setMode('light')}>Current mode: {mode}</button>
}

it.each(['light', 'system'])('stays dark before and after React despite a saved %s preference', saved => {
  localStorage.setItem(COLOR_MODE_KEY, saved)
  new Function('window', 'document', 'localStorage', bootstrap)(window, document, localStorage)
  expect(document.documentElement.dataset.colorMode).toBe('dark')
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  render(<ColorModeProvider><ColorModeSelect /><InternalControl /></ColorModeProvider>)
  expect(screen.queryByLabelText('Color mode')).toBeNull()
  expect(screen.getByRole('button', { name: 'Current mode: dark' })).toBeTruthy()
  expect(window.matchMedia).not.toHaveBeenCalled()
  expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0d0f10')
  expect(localStorage.getItem(COLOR_MODE_KEY)).toBe(saved)
})

it('ignores internal mode changes and other-tab preferences while disabled', () => {
  localStorage.setItem(COLOR_MODE_KEY, 'system')
  render(<ColorModeProvider><ColorModeSelect /><InternalControl /></ColorModeProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Current mode: dark' }))
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: COLOR_MODE_KEY, newValue: 'light', storageArea: localStorage })) })
  expect(document.documentElement.dataset.colorMode).toBe('dark')
  expect(screen.getByRole('button', { name: 'Current mode: dark' })).toBeTruthy()
  expect(localStorage.getItem(COLOR_MODE_KEY)).toBe('system')
})
