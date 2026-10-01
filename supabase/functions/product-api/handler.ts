import { activeSeason } from '../_shared/season/activation.ts'
import { ProductError, productResponse, type ProductInput, type ProductQuery } from './model.ts'
export type ProductDependencies = {
  load(token: string, installationId: number, seasonId: string, health: boolean): Promise<ProductInput>
  queue?: (token: string, installationId: number) => Promise<unknown>
  history?: (token: string, installationId: number, seasonId: string | undefined, offset: number, limit: number) => Promise<unknown>
  now?: () => string
}
const resources = new Set(['season', 'standings', 'snapshots', 'review-health', 'participant', 'score-history', 'seasons', 'archive', 'review-queue'])
export function createProductHandler(origin: string, deps: ProductDependencies) {
  return async (request: Request) => {
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,apikey,content-type',
      'access-control-allow-methods': 'GET,OPTIONS', 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Origin' }
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
    if (request.headers.get('origin') !== origin) return reply(403, { error: 'origin_denied' })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'GET') return reply(405, { error: 'method_not_allowed' })
    const authorization = request.headers.get('authorization')
    if (!authorization?.startsWith('Bearer ') || !authorization.slice(7).trim()) return reply(401, { error: 'sign_in_again' })
    const params = new URL(request.url).searchParams
    const allowed = new Set(['resource', 'installationId', 'participantId', 'offset', 'limit', 'seasonId'])
    const resource = params.get('resource') ?? 'season'
    const number = (key: string, fallback: number) => {
      const value = params.get(key)
      return value === null ? fallback : /^\d+$/.test(value) ? Number(value) : NaN
    }
    const installationId = number('installationId', 0), offset = number('offset', 0)
    const limit = number('limit', resource === 'snapshots' ? 7 : 50)
    const seasonId = params.get('seasonId') ?? undefined
    const participantId = params.get('participantId') ?? undefined
    if ([...params.keys()].some(key => !allowed.has(key) || params.getAll(key).length !== 1) ||
      (seasonId !== undefined && (resource !== 'archive' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(seasonId))) ||
      (resource === 'archive' && !seasonId) ||
      !resources.has(resource) || !Number.isSafeInteger(installationId) || installationId < 1 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 20000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > (resource === 'snapshots' ? 7 : 100) ||
      ((resource === 'participant' || resource === 'score-history') && !participantId) ||
      (participantId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(participantId))) {
      return reply(400, { error: 'invalid_request' })
    }
    try {
      if (resource === 'review-queue') {
        if (!deps.queue) throw new Error('Queue unavailable')
        return reply(200, await deps.queue(authorization.slice(7), installationId))
      }
      if (resource === 'seasons' || resource === 'archive') {
        if (!deps.history) throw new Error('History unavailable')
        return reply(200, await deps.history(authorization.slice(7), installationId, seasonId, offset, limit))
      }
      const asOf = deps.now?.() ?? new Date().toISOString()
      const input = await deps.load(authorization.slice(7), installationId, activeSeason(asOf).id, resource === 'review-health')
      return reply(200, productResponse(input, { resource, installationId, participantId, offset, limit } as ProductQuery, asOf))
    } catch (error) {
      return error instanceof ProductError ? reply(error.status, { error: error.code }) : reply(503, { error: 'product_unavailable' })
    }
  }
}
