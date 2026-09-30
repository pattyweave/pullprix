import { describe, expect, it } from 'vitest'
import { activeSeason } from './activation'
describe('global pilot season activation', () => {
 it('moves every team at the first Monday noon UTC boundary', () => {
  expect(activeSeason('2026-10-05T11:59:59Z').id).toBe('2026-09')
  const next = activeSeason('2026-10-05T12:00:00Z')
  expect(next.id).toBe('2026-10'); expect(next.startsAt).toBe('2026-10-05T12:00:00.000Z'); expect(next.endsAt).toBe('2026-11-02T12:00:00.000Z')
  expect(next.themePack).toEqual({id:'racing',version:'1.0.0'}); expect(next.scoringPolicyVersion).toBe('v1')
 })
 it('labels the last 72 hours without prematurely finalizing or awarding champions', () => {
  expect(activeSeason('2026-10-02T11:59:59Z').phase).toBe('active')
  expect(activeSeason('2026-10-02T12:00:00Z').phase).toBe('final_stage')
 })
})
