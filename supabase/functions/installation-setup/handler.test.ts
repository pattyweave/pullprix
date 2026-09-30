import { describe, expect, it, vi } from 'vitest'
import { createInstallationSetupHandler } from './handler'
import { SetupError } from './github'
const subject = { userId: 'user', sessionId: 'session', githubUserId: 7, login: 'owner' }
function fixture() {
 const deps = { subject: vi.fn().mockResolvedValue(subject), verify: vi.fn().mockResolvedValue({ accountId: 9, isAdmin: true, repositoryId: null }), commit: vi.fn().mockResolvedValue({ status: 'ready' }), revoke: vi.fn().mockResolvedValue(undefined) }
 const handler = createInstallationSetupHandler('https://app.test', deps)
 const request = (body: unknown = { installationId: 12 }, origin = 'https://app.test') => handler(new Request('https://api.test', { method: 'POST', headers: { origin, authorization: 'Bearer session-token', 'content-type': 'application/json' }, body: JSON.stringify(body) }))
 return { deps, request }
}
describe('installation callback boundary', () => {
 it('does not trust browser role and rejects unauthorized retries after persisting verification', async () => {
  const {deps, request}=fixture(); deps.verify.mockResolvedValue({accountId:9,isAdmin:false,repositoryId:42}); deps.commit.mockResolvedValue({status:'forbidden',error:'administrator_required'})
  expect((await request({installationId:12,retry:true,isAdmin:true})).status).toBe(403)
  expect(deps.commit).toHaveBeenCalledWith(subject,12,9,true,false,42)
 })
 it('ignores caller-supplied identities and account IDs', async () => { const { deps, request } = fixture(); const r = await request({ installationId: 12, userId: 'forged', accountId: 999 }); expect(r.status).toBe(200); expect(deps.verify).toHaveBeenCalledWith(12, subject); expect(deps.commit).toHaveBeenCalledWith(subject, 12, 9, false, true, null); expect(JSON.stringify(await r.json())).not.toContain('session-token') })
 it('does not grant or read progress after GitHub denial and expires old access', async () => { const { deps, request } = fixture(); deps.verify.mockRejectedValue(new SetupError('access_denied')); expect((await request()).status).toBe(403); expect(deps.revoke).toHaveBeenCalledWith(subject, 12); expect(deps.commit).not.toHaveBeenCalled() })
 it('fails closed on GitHub outages without leaking error details', async () => { const { deps, request } = fixture(); deps.verify.mockRejectedValue(new Error('secret upstream body')); const r = await request(); expect(r.status).toBe(503); expect(await r.json()).toEqual({ error: 'setup_unavailable' }); expect(deps.revoke).toHaveBeenCalled(); expect(deps.commit).not.toHaveBeenCalled() })
 it('requires a live caller before contacting GitHub', async () => { const { deps, request } = fixture(); deps.subject.mockRejectedValue(new SetupError('sign_in_again', 401)); expect((await request()).status).toBe(401); expect(deps.verify).not.toHaveBeenCalled() })
 it('rejects malformed IDs and cross-origin requests', async () => { const { deps, request } = fixture(); expect((await request({ installationId: -1 })).status).toBe(400); expect((await request({}, 'https://evil.test')).status).toBe(403); expect(deps.subject).not.toHaveBeenCalled() })
 it('retries work only on explicit request', async () => { const { deps, request } = fixture(); await request({ installationId: 12, retry: true }); expect(deps.commit).toHaveBeenCalledWith(subject, 12, 9, true, true, null) })
})
