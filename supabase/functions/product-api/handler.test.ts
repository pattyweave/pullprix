import { describe, expect, it, vi } from 'vitest'
import { createProductHandler } from './handler.ts'
import { ProductError, type ProductInput } from './model.ts'
import { createProductLoader } from './repository.ts'
const origin = 'http://127.0.0.1:5173', now = '2026-09-28T20:00:00Z'
const participantId = '00000000-0000-0000-0000-000000000001'
function fixture(): ProductInput {
  return { standings: { organizationId: 'org', seasonId: '2026-09', eligibleFrom: '2026-09-27T12:00:00Z',
    pendingPullRequests: 1, participants: [participantId, '00000000-0000-0000-0000-000000000002'].map(id => ({
      id, displayName: 'Person', avatarUrl: 'https://evil.test/track', eligible: true, active: true,
      joinedAt: '2026-09-27T12:00:00Z', leftAt: null })), components: [{
        id: 'award', organizationId: 'org', seasonId: '2026-09', participantId, occurredAt: '2026-09-28T12:00:00Z',
        points: 8, kind: 'approval', status: 'effective', pullRequestId: 'pr', pullRequestNumber: 2,
        pullRequestUrl: 'https://github.com/team/repo/pull/2', reviewId: 'private-review', reviewOutcome: 'approved',
        explanation: 'Earned approval', sourceReference: 'private-provider-reference', scoringPolicyVersion: 'v1',
      }] }, health: { organizationId: 'org', eligibleFrom: '2026-09-27T12:00:00Z', coverageFrom: now,
        pendingPullRequests: 1, participants: [], reviews: [], pullRequests: [], dailyQueue: [] } }
}
function harness(input = fixture()) {
  const load = vi.fn(async () => input)
  const handler = createProductHandler(origin, { load, now: () => now })
  const request = (query: string, headers: Record<string, string> = { origin, authorization: 'Bearer user-token' }, method = 'GET') =>
    handler(new Request(`https://example.test/functions/v1/product-api?installationId=42&${query}`, { headers, method }))
  return { load, request }
}
const resources = ['season', 'standings', 'snapshots', 'review-health', 'participant', 'score-history']
const query = (resource: string) => `resource=${resource}&participantId=${participantId}`
describe('PP-060 product API contracts', () => {
  it.each(resources)('%s uses the caller and organization boundary', async resource => {
    const { load, request } = harness()
    const response = await request(query(resource)), body = await response.json()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body).toMatchObject({ contractVersion: '1', organizationId: 'org', seasonId: '2026-09', pendingPullRequests: 1 })
    expect(load).toHaveBeenCalledWith('user-token', 42, '2026-09', resource === 'review-health')
    expect(JSON.stringify(body)).not.toMatch(/private-review|private-provider-reference|evil.test/)
  })
  it.each(resources)('%s rejects missing auth and propagates revoked team access', async resource => {
    const { load, request } = harness()
    expect((await request(query(resource), { origin })).status).toBe(401)
    expect(load).not.toHaveBeenCalled()
    load.mockRejectedValueOnce(new ProductError(403, 'access_denied'))
    const denied = await request(query(resource))
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({ error: 'access_denied' })
    load.mockRejectedValueOnce(new ProductError(401, 'sign_in_again'))
    expect((await request(query(resource))).status).toBe(401)
  })
  it('exposes accurate scores without inventing progress targets', async () => {
    const { request } = harness()
    expect(await (await request('resource=season')).json()).toMatchObject({ totalPoints: 8,
      participantCount: 2, progress: { status: 'unconfigured', policy: null, team: null } })
    const first = await (await request('resource=standings&limit=1')).json()
    expect(first).toMatchObject({ totalPoints: 8, total: 2, nextOffset: 1,
      items: [{ participantId, points: 8, rank: 1, progress: null, avatarUrl: null }] })
    const second = await (await request('resource=standings&limit=1&offset=1')).json()
    expect(second).toMatchObject({ nextOffset: null, items: [{ points: 0, rank: null, status: 'not_started' }] })
  })
  it('samples corrected history from entry, without future scores or invented health', async () => {
    const { request } = harness()
    const body = await (await request('resource=snapshots&limit=2')).json()
    expect(body).toMatchObject({ historyBasis: 'current_corrected_ledger', total: 3, nextOffset: 2 })
    expect(body.items.map((s: { totalPoints: number }) => s.totalPoints)).toEqual([0, 0])
    const tail = await (await request('resource=snapshots&offset=2')).json()
    expect(tail.items).toMatchObject([{ totalPoints: 8, health: null, progress: null }])
    expect(tail.nextOffset).toBeNull()
  })
  it('returns participant summary and bounded score explanations', async () => {
    const { request } = harness()
    expect(await (await request(query('participant'))).json()).toMatchObject({ participant: { participantId, points: 8 } })
    const history = await (await request(query('score-history'))).json()
    expect(history).toMatchObject({ totalPoints: 8, items: [{ kind: 'approval', points: 8, explanation: 'Earned approval', pullRequest: { number: 2 } }] })
    expect((await request('resource=participant&participantId=00000000-0000-0000-0000-000000000003')).status).toBe(404)
  })
  it('reports unavailable health baselines as null, not zero', async () => {
    const { request } = harness()
    const body = await (await request('resource=review-health')).json()
    expect(body.health).toMatchObject({ status: 'partial', baseline: null, recent: null, agingQueue: { count: 0, unknownReadinessCount: 0 } })
    expect(body.health.current).not.toHaveProperty('individualShare')
  })
  it.each(['resource=unknown', 'limit=101', 'offset=-1', 'offset=20001', 'limit=0', 'resource=snapshots&limit=8',
    'installationId=43', 'resource=participant', 'participantId=bad', 'seasonId=2025-01', 'limit=1&limit=2'])('rejects malformed or unbounded request %s', async bad => {
    const { load, request } = harness()
    expect((await request(bad)).status).toBe(400)
    expect(load).not.toHaveBeenCalled()
  })
  it('rejects cross-origin and mutation requests; supports preflight', async () => {
    const { load, request } = harness()
    expect((await request('', { origin: 'https://evil.test', authorization: 'Bearer token' })).status).toBe(403)
    expect((await request('', { origin }, 'POST')).status).toBe(405)
    expect((await request('', { origin }, 'OPTIONS')).status).toBe(204)
    expect(load).not.toHaveBeenCalled()
  })
  it('hides internal errors and rejects mismatched source scope', async () => {
    const input = fixture(); input.health!.organizationId = 'other'
    const { request } = harness(input)
    expect(await (await request('')).json()).toEqual({ error: 'product_unavailable' })
  })
  it('forwards bearer JWT to SQL without falling back to service authorization', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(fixture())))
    await createProductLoader('https://db.test', 'server-key', transport)('user-token', 42, '2026-09', false)
    const [url, options] = transport.mock.calls[0]!
    expect(url).toBe('https://db.test/rest/v1/rpc/get_product_api_input')
    expect(options?.headers).toMatchObject({ authorization: 'Bearer user-token' })
    expect(JSON.parse(options!.body as string)).toEqual({ p_installation_id: 42, p_season_id: '2026-09', p_health: false })
    for (const status of [401, 403, 500]) {
      transport.mockResolvedValueOnce(new Response('sensitive upstream error', { status }))
      await expect(createProductLoader('https://db.test', 'server-key', transport)('token', 42, '2026-09', false))
        .rejects.toMatchObject({ status: status === 500 ? 503 : status })
    }
  })
})

it('forwards archive reads under the caller token and rejects invalid or unauthorized requests', async () => {
 const history=vi.fn().mockResolvedValue({items:[]}),load=vi.fn()
 const handler=createProductHandler(origin,{load,history})
 const request=(query:string,auth=true)=>handler(new Request(`https://example.test/?installationId=42&${query}`,{headers:{origin,...(auth?{authorization:'Bearer caller'}:{})}}))
 expect((await request('resource=seasons',false)).status).toBe(401)
 expect(history).not.toHaveBeenCalled()
 expect((await request('resource=archive')).status).toBe(400)
 expect((await request('resource=archive&seasonId=2026-13')).status).toBe(400)
 expect((await request('resource=archive&seasonId=2026-08')).status).toBe(200)
 expect(history).toHaveBeenCalledWith('caller',42,'2026-08',0,50)
 expect(load).not.toHaveBeenCalled()
 history.mockRejectedValue(new ProductError(403,'access_denied'))
 expect((await request('resource=seasons')).status).toBe(403)
})
