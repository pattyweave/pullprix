import { describe, expect, it } from 'vitest'
import { createTeamLoader } from './loader'
import { fixture, mockClient } from './fixtures.test-support'
import { adaptFrame } from './adapter'
describe('PP-061 live data loader', () => {
  it('loads authorized domain data and caches corrected snapshots for at most a minute', async () => {
    const client = mockClient(); let clock = 0
    const loader = createTeamLoader(client, 42, () => clock)
    expect((await loader.load()).season.totalPoints).toBe(8)
    clock = 15000; await loader.load()
    expect(client.installationSetup).toHaveBeenCalledTimes(1)
    expect(client.product.mock.calls.filter(([q]) => q.resource === 'snapshots')).toHaveLength(1)
    clock = 60000; await loader.load()
    expect(client.product.mock.calls.filter(([q]) => q.resource === 'snapshots')).toHaveLength(2)
    clock = 240000; await loader.load()
    expect(client.installationSetup).toHaveBeenCalledTimes(2)
  })
  it('rechecks access exactly once after lease denial, then retries the read', async () => {
    const client = mockClient(), loader = createTeamLoader(client, 42)
    client.product.mockRejectedValueOnce(new Error('access_denied'))
    await expect(loader.load()).resolves.toMatchObject({ season: { totalPoints: 8 } })
    expect(client.installationSetup).toHaveBeenCalledTimes(2)
  })
  it('fails closed after repeated denial and never returns cached data', async () => {
    const client = mockClient(), loader = createTeamLoader(client, 42)
    await loader.load()
    client.product.mockRejectedValue(new Error('access_denied'))
    await expect(loader.load()).rejects.toThrow('access_denied')
    expect(client.installationSetup).toHaveBeenCalledTimes(2)
    expect(client.product.mock.calls.filter(([q]) => q.resource === 'season')).toHaveLength(3)
  })
  it('does not retry GitHub verification for signed-out sessions', async () => {
    const client = mockClient(), loader = createTeamLoader(client, 42)
    client.product.mockRejectedValue(new Error('sign_in_again'))
    await expect(loader.load()).rejects.toThrow('sign_in_again')
    expect(client.installationSetup).toHaveBeenCalledTimes(1)
  })
  it('does not start product reads before setup is ready', async () => {
    const client = mockClient()
    client.installationSetup.mockRejectedValueOnce(new Error('waiting_for_webhook'))
    await expect(createTeamLoader(client, 42).load()).rejects.toThrow('waiting_for_webhook')
    expect(client.product).not.toHaveBeenCalled()
  })
  it('rejects data from another organization or across season rollover', async () => {
    const client = mockClient()
    client.product.mockResolvedValueOnce({ ...fixture().season, organizationId: 'other' })
    await expect(createTeamLoader(client, 42).load()).rejects.toThrow('invalid_product_data')
    const next = mockClient()
    next.product.mockImplementation(async query => query.resource === 'season' ? fixture().season : { ...fixture().season, seasonId: '2026-10' })
    await expect(createTeamLoader(next, 42).load()).rejects.toThrow('invalid_product_data')
  })
  it('fetches every bounded page instead of dropping people beyond the first 100', async () => {
    const data = fixture(), client = mockClient(data)
    data.participants = Array.from({ length: 101 }, (_, i) => ({ ...data.participants[1]!, participantId: String(i) }))
    data.season.participantCount = 101; data.season.totalPoints = 0
    const original = client.product.getMockImplementation()!
    client.product.mockImplementation(async query => query.resource === 'standings' ? {
      ...data.season, items: data.participants.slice(query.offset ?? 0, (query.offset ?? 0) + 100), total: 101, nextOffset: query.offset === 0 ? 100 : null,
    } : original(query))
    expect((await createTeamLoader(client, 42).load()).participants).toHaveLength(101)
  })
  it('rejects invalid pagination and incoherent point totals', async () => {
    const data = fixture(); data.season.totalPoints = 999
    await expect(createTeamLoader(mockClient(data), 42).load()).rejects.toThrow('data_changed')
    const client = mockClient(), original = client.product.getMockImplementation()!
    client.product.mockImplementation(async query => query.resource === 'standings' ? { ...fixture().season, items: [], total: 1, nextOffset: 0 } : original(query))
    await expect(createTeamLoader(client, 42).load()).rejects.toThrow('invalid_product_data')
  })
  it('deduplicates concurrent refreshes and refreshes snapshots after score changes', async () => {
    const data = fixture(), client = mockClient(data), loader = createTeamLoader(client, 42)
    const a = loader.load(), b = loader.load(); expect(a).toBe(b); await a
    data.participants[0]!.points = 16; data.season.totalPoints = 16
    await loader.load()
    expect(client.product.mock.calls.filter(([q]) => q.resource === 'snapshots')).toHaveLength(2)
  })
  it('adapts discrete historical points without inventing identity, health or track positions', () => {
    const data = fixture(), frame = adaptFrame(data, data.snapshots[0]!.sampledAt)
    expect(frame.rows[0]).toMatchObject({ displayName: 'Real Reviewer', points: 0, rank: null })
    expect(frame).not.toHaveProperty('positions')
    expect(adaptFrame(data, 'old-season')).toMatchObject({ totalPoints: 8, snapshot: null })
  })
})

describe('PP-064 loader recovery', () => {
  it('rechecks setup on manual refresh and detects removed repositories', async () => {
    const data = fixture(), client = mockClient(data), loader = createTeamLoader(client, 42)
    await loader.load()
    client.installationSetup.mockResolvedValueOnce({ setup: { ...data.setup, repositories: [] }, season: data.season.season })
    const result = await loader.load(true)
    expect(result.setup.repositories).toHaveLength(0)
    expect(result.removedRepositoryCount).toBe(1)
    expect(client.installationSetup).toHaveBeenCalledTimes(2)
  })
  it('refreshes incomplete import state after one minute', async () => {
    const data = fixture(); data.setup.repositories[0]!.status = 'running'
    const client = mockClient(data); let clock = 0
    const loader = createTeamLoader(client, 42, () => clock)
    await loader.load(); clock = 60000; await loader.load()
    expect(client.installationSetup).toHaveBeenCalledTimes(2)
  })
  it('recognizes an explicit absent season only inside the authorized scope', async () => {
    const client = mockClient()
    client.product.mockResolvedValueOnce({ ...fixture().season, season: null } as never)
    await expect(createTeamLoader(client, 42).load()).rejects.toThrow('no_active_season')
    client.product.mockResolvedValueOnce({ ...fixture().season, organizationId: 'other', season: null } as never)
    await expect(createTeamLoader(client, 42).load()).rejects.toThrow('invalid_product_data')
  })
})
