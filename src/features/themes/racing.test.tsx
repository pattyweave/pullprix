import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TimingTower } from '../../components/hud/TimingTower'
import { Badge } from '../../components/hud/Badge'
import { createSeasonEntry, createSeasonSnapshot, type SeasonDefinition } from '../../../supabase/functions/_shared/season/snapshot'
import type { StandingsInput } from '../../../supabase/functions/_shared/standings/v1'
import { racingThemePack, RACING_MANIFEST } from './racing'
import type { SeasonSnapshot, ThemePack } from './types'

const definition: SeasonDefinition = { id: '2026-09', version: 1, name: 'September Championship', scoringPolicyVersion: 'v1',
  themePack: { id: 'racing', version: '1.0.0', assetBaseUrl: '/assets', integrity: 'fixture' },
  progressPolicy: { version: 'fixture', individualTargetPoints: 200, lateJoinFloor: .25, milestones: [] } }
function input(): StandingsInput {
  return { organizationId: 'org', seasonId: '2026-09', eligibleFrom: '2026-09-07T12:00:00Z', pendingPullRequests: 0,
    participants: ['alice', 'bob', 'zero'].map(id => ({ id, displayName: id, avatarUrl: null, eligible: true, active: true, joinedAt: '2026-09-07T12:00:00Z', leftAt: null })),
    components: ['alice', 'bob'].map(id => ({ id, organizationId: 'org', seasonId: '2026-09', participantId: id, pullRequestId: id, pullRequestNumber: 1,
      pullRequestUrl: 'https://github.com/t/r/pull/1', reviewId: id, reviewOutcome: 'approved', occurredAt: '2026-09-10T12:00:00Z', kind: 'approval', points: 8,
      explanation: 'Earned', sourceReference: 'review', scoringPolicyVersion: 'v1', status: 'effective' })) }
}
function snapshot(i = input(), at = '2026-09-28T12:00:00Z', finalized = false) {
  return createSeasonSnapshot(i, definition, createSeasonEntry(i, definition.progressPolicy), at, { finalized })
}
function view(s: SeasonSnapshot) { return racingThemePack.buildViewModel({ snapshot: s, mechanicState: racingThemePack.deriveMechanicState(s) }) }

describe('PP-046 racing pack', () => {
  it('maps progress directly to the existing circuit and preserves ties', () => {
    const model = view(snapshot())
    expect(model.trackDrivers.map(p => p.progress)).toEqual([.04, .04, 0])
    expect(model.timingRows.map(p => p.position)).toEqual([1, 1, null])
    expect(model.timingRows.map(p => p.gap)).toEqual(['Joint lead', 'Joint lead', 'On the Start Line'])
    expect(model.circuit.id).toBe('jacarepagua')
    expect(model.circuit.path.length).toBeGreaterThan(100)
    expect(model.circuitAssetUrl).toContain('.svg')
  })
  it('feeds the reusable timing tower and badge components', () => {
    const model = view(snapshot())
    const html = renderToStaticMarkup(<TimingTower rows={model.timingRows} />)
    expect(html).toContain('On the Start Line'); expect(html).toContain('Joint lead'); expect(html).toContain('—')
    expect(renderToStaticMarkup(<Badge {...model.drivers[0]!.badges[0]!} />)).toContain('Off the Grid')
  })
  it('derives stable identity from participant ID across roster and name changes', () => {
    const a = view(snapshot()).drivers[0]!, i = input()
    i.participants[0]!.displayName = 'New name'; i.participants.reverse()
    const b = view(snapshot(i)).drivers.find(d => d.id === a.id)!
    expect([b.color, b.number]).toEqual([a.color, a.number]); expect(b.name).toBe('New name')
    expect(b).not.toHaveProperty('flag'); expect(b).not.toHaveProperty('topSpeed')
  })
  it('does not award anything to zero-point participants', () => {
    const zero = view(snapshot()).drivers.find(p => p.id === 'zero')!
    expect(zero).toMatchObject({ rank: null, statusLabel: 'On the Start Line', badges: [] })
  })
  it('maps earned follow-through and rescue components to cosmetic badges', () => {
    const i = input(), base = i.components[0]!
    i.components.push({ ...base, id: 'follow', kind: 'follow_through', points: 4 }, { ...base, id: 'rescue', kind: 'aging_pr_rescue', points: 3 })
    const driver = view(snapshot(i)).drivers.find(d => d.id === 'alice')!
    expect(driver.badges.map(b => b.id)).toEqual(['first_review', 'follow_through', 'aging_pr_rescue'])
    expect(driver.points).toBe(15)
  })
  it('reversals remove earned badges without changing the input', () => {
    const i = input(); i.components = []
    expect(view(snapshot(i)).drivers.every(d => d.badges.length === 0)).toBe(true)
    const s = snapshot(), copy = structuredClone(s)
    expect(view(s)).toEqual(view(s)); expect(s).toEqual(copy)
  })
  it('does not wrap completed progress or change championship points', () => {
    const i = input(); i.components[0]!.points = 240
    const s = snapshot(i), model = view(s)
    expect(model.trackDrivers[0]!.progress).toBe(1)
    expect(model.drivers[0]!.points).toBe(240)
    expect(model.drivers[0]!.badges.some(b => b.id === 'progress_complete')).toBe(true)
    expect(racingThemePack.deriveMechanicState(s).drivers[0]!.completedLap).toBe(true)
  })
  it('keeps championships provisional until explicit season completion', () => {
    expect(view(snapshot()).drivers.some(d => d.badges.some(b => b.id.includes('champion')))).toBe(false)
    const model = view(snapshot(input(), '2026-10-05T12:00:00Z', true))
    expect(model.drivers.slice(0, 2).every(d => d.title === 'Co-Champion')).toBe(true)
    expect(model.phaseLabel).toBe('Chequered Flag')
  })
  it('maps the final stage and inactive participants without removing points', () => {
    const i = input(); i.participants[0]!.active = false; i.participants[0]!.leftAt = '2026-09-20T00:00:00Z'
    const model = view(snapshot(i, '2026-10-03T00:00:00Z'))
    expect(model.phaseLabel).toBe('Final Lap'); expect(model.drivers.find(d => d.id === 'alice')).toMatchObject({ points: 8, statusLabel: 'Inactive driver' })
  })
  it('rejects incompatible theme versions and mismatched replay frames', () => {
    const s = snapshot(), state = racingThemePack.deriveMechanicState(s)
    expect(() => racingThemePack.buildViewModel({ snapshot: s, mechanicState: { ...state, generatedAt: 'wrong' } })).toThrow('does not match')
    const incompatible = structuredClone(s); incompatible.season.themePack.version = '2'; expect(() => view(incompatible)).toThrow('Unsupported')
  })
  it('supports a second theme without changing generic scoring or snapshot shape', () => {
    const gardening: ThemePack<{ growth: number[] }, { plants: number[] }> = {
      manifest: { id: 'gardening-example', version: '1', supportedContractVersion: '1', vocabulary: { ...RACING_MANIFEST.vocabulary, participant: { singular: 'gardener', plural: 'gardeners' } } },
      deriveMechanicState: s => ({ growth: s.participants.map(p => p.progress.normalized) }),
      buildViewModel: ({ mechanicState }) => ({ plants: mechanicState.growth }),
    }
    const s = snapshot(), state = gardening.deriveMechanicState(s)
    expect(gardening.buildViewModel({ snapshot: s, mechanicState: state }).plants).toEqual(view(s).trackDrivers.map(d => d.progress))
  })
})
