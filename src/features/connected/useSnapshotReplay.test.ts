// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSnapshotReplay } from './useSnapshotReplay'
const samples = [1, 2, 3].map(day => ({ sampledAt: `2026-09-0${day}T12:00:00Z`, totalPoints: day, participants: [] }))
afterEach(() => { cleanup(); vi.useRealTimers() })
it('holds the manually selected snapshot through time and polling, then returns to live', () => {
 vi.useFakeTimers()
 const {result,rerender} = renderHook(({rows}) => useSnapshotReplay('season', rows), {initialProps:{rows:samples}})
 act(() => result.current.seek(samples[1]!.sampledAt))
 act(() => vi.advanceTimersByTime(60000))
 rerender({rows:[...samples]})
 expect(result.current.sampledAt).toBe(samples[1]!.sampledAt)
 act(() => result.current.seek(null))
 expect(result.current.sampledAt).toBeNull()
})
it('returns to live when the selected sample disappears or the season changes', () => {
 const {result,rerender} = renderHook(({season,rows}) => useSnapshotReplay(season, rows), {initialProps:{season:'one',rows:samples}})
 act(() => result.current.seek(samples[0]!.sampledAt))
 rerender({season:'one',rows:[]})
 expect(result.current.sampledAt).toBeNull()
 rerender({season:'one',rows:samples})
 act(() => result.current.seek(samples[1]!.sampledAt))
 rerender({season:'two',rows:samples})
 expect(result.current.sampledAt).toBeNull()
})
