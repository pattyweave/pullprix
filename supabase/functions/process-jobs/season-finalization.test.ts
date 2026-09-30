import { describe, expect, it, vi } from 'vitest'
import { buildSeasonResult, createSeasonFinalizer, type FinalizationInput } from './season-finalization'
function fixture(): FinalizationInput {
  return { organizationId: 'org', seasonId: '2026-09', startsAt: '2026-09-07T12:00:00Z', endsAt: '2026-10-05T12:00:00Z', revision: 'rev',
    definition: { definitionVersion: 1, name: 'Pull Prix Championship', themePack: { id: 'racing', version: '1.0.0' }, scoringPolicyVersion: 'v1', progressPolicy: null },
    input: { organizationId: 'org', seasonId: '2026-09', eligibleFrom: '2026-09-07T12:00:00Z', pendingPullRequests: 0,
      participants: ['a','b','zero'].map(id => ({ id, displayName: id, avatarUrl: 'https://evil.test/image', active: true, eligible: true, joinedAt: '2026-09-07T12:00:00Z', leftAt: null })),
      components: ['a','b'].map(id => ({ id, organizationId: 'org', seasonId: '2026-09', participantId: id, occurredAt: '2026-09-28T12:00:00Z', points: 8, kind: 'approval', status: 'effective', pullRequestId: id, pullRequestNumber: 1, pullRequestUrl: 'https://github.com/test/repo/pull/1', reviewId: 'private-review', reviewOutcome: 'approved', explanation: 'Earned approval', sourceReference: 'private-source', scoringPolicyVersion: 'v1' })) } }
}
describe('PP-070 frozen results', () => {
  it('freezes shared champions without exposing provider references or inventing health', () => {
    const result = buildSeasonResult(fixture())
    expect(result).toMatchObject({ totalPoints: 16, health: null, progress: null, historyBasis: 'frozen_at_finalization' })
    expect(result.participants.map(p => [p.rank,p.champion,p.coChampion])).toEqual([[1,true,true],[1,true,true],[null,false,false]])
    expect(JSON.stringify(result)).not.toMatch(/private-review|private-source|evil.test/)
  })
  it('rejects incomplete scoring and mismatched calendar or organization', () => {
    const input=fixture(); input.input.pendingPullRequests=1
    expect(()=>buildSeasonResult(input)).toThrow('not ready')
    expect(()=>buildSeasonResult({...fixture(),organizationId:'other'})).toThrow('scope')
    expect(()=>buildSeasonResult({...fixture(),endsAt:'2026-10-06T12:00:00Z'})).toThrow('scope')
  })
  it('excludes end-boundary activity and never crowns a zero-point winner', () => {
    const input=fixture(); input.input.components.forEach(c=>{c.occurredAt=input.endsAt})
    expect(buildSeasonResult(input).participants.some(p=>p.champion)).toBe(false)
    expect(buildSeasonResult(input).totalPoints).toBe(0)
  })
  it('leaves stale commits retryable and bounds each worker batch', async () => {
    const commit=vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const run=createSeasonFinalizer({inputs:async()=>[fixture()],commit})
    expect(await run()).toBe(0);expect(await run()).toBe(1)
    await expect(createSeasonFinalizer({inputs:async()=>[fixture(),fixture(),fixture()],commit})()).rejects.toThrow('batch')
    expect(commit).toHaveBeenCalledTimes(2)
  })
})
