import { activeSeason } from '../_shared/season/activation.ts'
import { SetupError, type VerifiedInstallation } from './github.ts'
type Subject = { userId: string; sessionId: string; githubUserId: number; login: string }
export type SetupDependencies = {
  subject(token: string): Promise<Subject>
  verify(installationId: number, subject: Subject): Promise<VerifiedInstallation>
  commit(subject: Subject, installationId: number, accountId: number, retry: boolean, isAdmin: boolean, repositoryId: number | null): Promise<unknown>
  revoke(subject: Subject, installationId: number): Promise<void>
}
export function createInstallationSetupHandler(origin: string, deps: SetupDependencies) {
  return async (request: Request) => {
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,apikey,content-type',
      'access-control-allow-methods': 'POST,OPTIONS', 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Origin' }
    const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers })
    if (request.headers.get('origin') !== origin) return reply(403, { error: 'origin_denied' })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
    const authorization = request.headers.get('authorization')
    if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'sign_in_again' })
    let body
    try { body = await request.json() } catch { return reply(400, { error: 'invalid_request' }) }
    if (!Number.isSafeInteger(body?.installationId) || body.installationId < 1 ||
      (body.retry !== undefined && typeof body.retry !== 'boolean')) return reply(400, { error: 'invalid_request' })
    try {
      const subject = await deps.subject(authorization.slice(7))
      let installation: VerifiedInstallation
      try { installation = await deps.verify(body.installationId, subject) }
      catch (error) { await deps.revoke(subject, body.installationId); throw error }
      const setup = await deps.commit(subject, body.installationId, installation.accountId, body.retry === true, installation.isAdmin, installation.repositoryId)
      if (setup && typeof setup === 'object' && 'error' in setup && setup.error === 'administrator_required') return reply(403, { error: 'administrator_required' })
      return reply(200, { setup, season: activeSeason() })
    } catch (error) {
      return error instanceof SetupError ? reply(error.status, { error: error.code }) : reply(503, { error: 'setup_unavailable' })
    }
  }
}
