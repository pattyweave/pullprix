import { describe, expect, it, vi } from 'vitest'
import { createReviewQueueLoader, queueItems, type QueuePR } from './review-queue.ts'
const repo = { id: 'repo', githubId: 42, name: 'team/repo' }
const actor = (login: string) => ({ login, __typename: 'User' })
const pr = (changes: Partial<QueuePR> = {}): QueuePR => ({ number: 1, title: 'Improve circuit', isDraft: false,
  createdAt: '2026-10-01T00:00:00Z', author: actor('author'), reviewDecision: 'REVIEW_REQUIRED',
  reviews: { nodes: [], pageInfo: { hasPreviousPage: false } }, ...changes })
const review = (login: string, state: string) => ({ author: actor(login), state })
describe('PP-091 review workflow', () => {
  it('keeps personal conflicts in queue without suggesting them', () => {
    expect(queueItems(repo, [pr()], 'author')[0]?.conflict).toBe('author')
    expect(queueItems(repo, [pr({ reviews: { nodes: [review('me', 'COMMENTED')], pageInfo: { hasPreviousPage: false } } })], 'ME')[0]?.conflict).toBe('reviewed')
    expect(queueItems(repo, [pr()], 'me')[0]).toMatchObject({ reason: 'required', conflict: null, url: 'https://github.com/team/repo/pull/1' })
  })
  it('drops approved, draft, author-blocked, unknown and truncated review histories', () => {
    for (const change of [{ isDraft: true }, { reviewDecision: 'APPROVED' }, { reviewDecision: 'CHANGES_REQUESTED' },
      { reviewDecision: 'UNKNOWN' }, { reviews: { nodes: [], pageInfo: { hasPreviousPage: true } } },
      { reviews: { nodes: [review('other', 'CHANGES_REQUESTED')], pageInfo: { hasPreviousPage: false } } },
      { author: { login: 'bot', __typename: 'Bot' } }]) expect(queueItems(repo, [pr(change)], 'me')).toEqual([])
  })
  it('distinguishes initial reviews without inventing branch requirements', () => {
    expect(queueItems(repo, [pr({ reviewDecision: null })], 'me')[0]?.reason).toBe('initial')
    expect(queueItems(repo, [pr({ reviewDecision: null, reviews: { nodes: [review('other', 'COMMENTED')], pageInfo: { hasPreviousPage: false } } })], 'me')).toEqual([])
    expect(queueItems(repo, [pr({ reviews: { nodes: [review('other', 'CHANGES_REQUESTED'), review('other', 'APPROVED')], pageInfo: { hasPreviousPage: false } } })], 'me')).toHaveLength(1)
  })
})
function harness(permission: unknown = { user: { id: 7 }, permission: 'read' }, graph: unknown = { data: { repository: { databaseId: 42, pullRequests: { nodes: [pr()], pageInfo: { hasNextPage: false } } } } }) {
  const fetcher = vi.fn(async (url: string) => url.includes('/rpc/') ? Response.json({ organizationId: 'org', truncated: false,
    subject: { githubUserId: 7, login: 'me' }, repositories: [repo] }) : url.includes('/permission') ? Response.json(permission) : Response.json(graph))
  const tokens = { get: vi.fn(async () => 'installation-token'), invalidate: vi.fn() }
  return { fetcher, tokens, load: createReviewQueueLoader('https://db.test', 'key', tokens, fetcher as unknown as typeof fetch) }
}
describe('queue access boundary', () => {
  it('forwards the user JWT, scopes app token and checks repo permission before metadata', async () => {
    const { load, fetcher, tokens } = harness()
    expect(await load('user-jwt', 99)).toMatchObject({ status: 'complete', nextId: 'repo:1', items: [{ title: 'Improve circuit' }] })
    expect(fetcher.mock.calls[0]?.[0]).toContain('get_review_queue_context')
    expect(tokens.get).toHaveBeenCalledWith({ github_installation_id: 99, repository_selection: 'selected', repository_ids: [42] })
    expect(fetcher.mock.calls[1]?.[0]).toContain('/collaborators/me/permission')
  })
  it.each([{ user: { id: 8 }, permission: 'admin' }, { user: { id: 7 }, permission: 'none' }])('never loads metadata for an unverified repo', async permission => {
    const { load, fetcher } = harness(permission)
    expect(await load('jwt', 99)).toMatchObject({ items: [], nextId: null })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('reports partial for GraphQL errors or repository identity mismatch', async () => {
    for (const graph of [{ errors: [{ message: 'denied' }] }, { data: { repository: { databaseId: 123 } } }]) {
      expect(await harness(undefined, graph).load('jwt', 99)).toMatchObject({ status: 'partial', items: [] })
    }
  })
  it('stops before GitHub when session or membership is revoked', async () => {
    const { load, fetcher, tokens } = harness()
    fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }))
    await expect(load('jwt', 99)).rejects.toMatchObject({ code: 'access_denied' })
    expect(tokens.get).not.toHaveBeenCalled()
  })
})

import { createProductHandler } from './handler.ts'
it('routes the queue through authorization and origin checks without loading standings', async () => {
  const queue = vi.fn(async () => ({ items: [] })), load = vi.fn()
  const handler = createProductHandler('https://www.pullprix.com', { queue, load })
  const url = 'https://db.test/functions/v1/product-api?installationId=99&resource=review-queue'
  expect((await handler(new Request(url, { headers: { origin: 'https://www.pullprix.com', authorization: 'Bearer user-token' } }))).status).toBe(200)
  expect(queue).toHaveBeenCalledWith('user-token', 99)
  expect(load).not.toHaveBeenCalled()
  expect((await handler(new Request(url, { headers: { origin: 'https://evil.test', authorization: 'Bearer user-token' } }))).status).toBe(403)
  expect((await handler(new Request(url, { headers: { origin: 'https://www.pullprix.com' } }))).status).toBe(401)
  expect(queue).toHaveBeenCalledTimes(1)
})
