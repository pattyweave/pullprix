// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { activeSeason } from '../../../supabase/functions/_shared/season/activation'
import { SeasonWelcome } from './SeasonWelcome'
import { SeasonCountdown } from './SeasonCountdown'
import { countdownLabel } from './countdown'
afterEach(() => {cleanup();vi.useRealTimers()})
describe('automatic racing season welcome', () => {
 it('loads the published racing asset and scoring rules without launch controls', () => {
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-28T12:00:00Z'))
  render(<SeasonWelcome season={activeSeason()} onRollover={vi.fn()} />)
  expect(screen.getByAltText('Jacarepaguá circuit layout')).toBeTruthy()
  expect(screen.getByText('7d 0h 0m remaining')).toBeTruthy()
  expect(screen.getByText('How championship points work')).toBeTruthy()
  expect(screen.getByText('8 pts')).toBeTruthy(); expect(screen.getByText('12 pts')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
 })
 it('does not load a mismatched theme', () => {
  render(<SeasonWelcome season={{...activeSeason(),themePack:{id:'racing',version:'2.0.0'}}} onRollover={vi.fn()} />)
  expect(screen.queryByRole('img')).toBeNull();expect(screen.getByRole('status')).toBeTruthy()
 })
 it('refreshes once at the boundary and never displays negative time', () => {
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-05T11:59:59Z')); const rollover=vi.fn()
  render(<SeasonCountdown endsAt="2026-10-05T12:00:00Z" onRollover={rollover} />)
  act(()=>vi.advanceTimersByTime(3000));expect(rollover).toHaveBeenCalledTimes(1)
  expect(countdownLabel('2026-10-05T12:00:00Z',Date.now())).toBe('Next season is ready')
 })
})
