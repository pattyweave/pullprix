// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ColorModeProvider } from './ColorModeProvider'
import { ColorModeSelect } from './ColorModeSelect'
import { LiveDashboard } from '../connected/TeamDashboard'
import { fixture } from '../connected/fixtures.test-support'

vi.mock('../track/usePathSampler', () => ({ usePathSampler: () => ({ length: 100, pointAt: (t: number) => ({ x: t * 100, y: 0, angle: 0 }) }) }))

afterEach(() => {
  cleanup()
  localStorage.clear()
  delete document.documentElement.dataset.colorMode
  document.documentElement.classList.remove('dark')
  vi.unstubAllGlobals()
})

it('preserves the selected driver, historical frame, and open panels when switching both modes', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  const data = fixture()
  data.snapshots[0]!.participants.push({ participantId: 'zero', points: 0, rank: null, tied: false })
  const noop = async () => {}
  render(<ColorModeProvider><ColorModeSelect /><LiveDashboard data={data} installationId={42} refreshing={false} refresh={noop} retryImports={noop} reviewQueue={<div />} /></ColorModeProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Select New Driver' }))
  fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
  const menu = document.querySelector('details.race-operations')!
  menu.setAttribute('open', '')
  for (const mode of ['light', 'dark']) {
    fireEvent.change(screen.getByLabelText('Color mode'), { target: { value: mode } })
    expect(document.documentElement.dataset.colorMode).toBe(mode)
    expect(screen.getByRole('button', { name: 'Select New Driver' }).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('0')
    expect(screen.getByText('Review health is available in the live view.')).toBeTruthy()
    expect(menu.hasAttribute('open')).toBe(true)
  }
})
