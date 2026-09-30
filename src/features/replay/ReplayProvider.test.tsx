// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReplayProvider, useReplay } from './ReplayProvider'
function DemoProbe() {
  const replay = useReplay()
  return <><p>Day {replay.currentDay} of {replay.totalDays}</p><p>{replay.snapshot.standings.length} demo drivers</p>
    <button onClick={() => replay.setDay(replay.totalDays)}>Final day</button></>
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('runs the demo replay without a session, Supabase configuration or network', () => {
  const fetcher = vi.fn(() => { throw new Error('Demo must be offline') }); vi.stubGlobal('fetch', fetcher)
  render(<ReplayProvider><DemoProbe /></ReplayProvider>)
  expect(screen.getByText('Day 1 of 35')).toBeTruthy()
  fireEvent.click(screen.getByText('Final day'))
  expect(screen.getByText('Day 35 of 35')).toBeTruthy()
  expect(fetcher).not.toHaveBeenCalled()
})
