import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createInstallationVerifier } from './github'
let pem: string
beforeAll(async () => {
 const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify'])
 pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`
})
const installation = { id: 12, app_id: 5, suspended_at: null, permissions: { members: 'read' }, account: { id: 9, login: 'org', type: 'Organization' } }
const membership = { user: { id: 7 }, organization: { id: 9 }, state: 'active', role: 'admin' }
const user = { githubUserId: 7, login: 'owner' }
function run(member: unknown = membership, install: unknown = installation) {
 const fetcher = vi.fn().mockResolvedValueOnce(Response.json(install)).mockResolvedValueOnce(Response.json({ token: 'private-token' })).mockResolvedValueOnce(Response.json(member))
 return { fetcher, verify: createInstallationVerifier('5', pem, fetcher) }
}
describe('live GitHub manager verification', () => {
 it('checks numeric user/account IDs and requests only members read', async () => { const { fetcher, verify } = run(); expect(await verify(12,user)).toEqual({ accountId: 9, accountLogin: 'org', accountType: 'Organization', isAdmin:true, repositoryId:null }); expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ permissions: { metadata:'read', members: 'read' } }); expect(fetcher.mock.calls[2][0]).toBe('https://api.github.com/orgs/org/memberships/owner') })
 it.each([{ ...membership, state:'pending' }, { ...membership, user:{id:999} }, { ...membership, organization:{id:999} }])('rejects pending or mismatched membership %#', async member => { await expect(run(member).verify(12,user)).rejects.toMatchObject({code:'access_denied'}) })
 it('rejects unapproved permission before minting a token', async () => { const { verify, fetcher } = run(membership,{...installation,permissions:{}}); await expect(verify(12,user)).rejects.toMatchObject({code:'permission_required'}); expect(fetcher).toHaveBeenCalledTimes(1) })
 it.each([{...installation,app_id:99}, {...installation,id:99}, {...installation,suspended_at:'2026-01-01'}])('rejects wrong app, installation, and suspension %#', async install => { await expect(run(membership,install).verify(12,user)).rejects.toMatchObject({code:'installation_unavailable'}) })
 it('allows only the matching owner for a personal installation', async () => { const install = {...installation,account:{id:7,login:'owner',type:'User'}}; const { verify, fetcher }=run(membership,install); await verify(12,user); expect(fetcher).toHaveBeenCalledTimes(1); const denied=vi.fn().mockResolvedValueOnce(Response.json(install)).mockResolvedValueOnce(Response.json({token:'t'})).mockResolvedValueOnce(Response.json({total_count:0,repositories:[]})); await expect(createInstallationVerifier('5',pem,denied)(12,{...user,githubUserId:8})).rejects.toMatchObject({code:'access_denied'}) })
})

describe('additional team access', () => {
 it('admits an active organization member without admin powers',async()=>{ expect(await run({...membership,role:'member'}).verify(12,user)).toMatchObject({isAdmin:false,repositoryId:null}) })
 const repo={id:42,owner:{id:9,login:'org'},name:'selected'}
 function outside(collaborator=true, identity=7) {
  const f=vi.fn().mockResolvedValueOnce(Response.json(installation)).mockResolvedValueOnce(Response.json({token:'private'}))
    .mockResolvedValueOnce(new Response(null,{status:404})).mockResolvedValueOnce(Response.json({total_count:1,repositories:[repo]}))
    .mockResolvedValueOnce(new Response(null,{status:collaborator?204:404}))
    .mockResolvedValueOnce(Response.json({permission:'read',user:{id:identity}}))
  return {f,verify:createInstallationVerifier('5',pem,f)}
 }
 it('admits a verified selected-repository collaborator with read-only app access',async()=>{const {f,verify}=outside();expect(await verify(12,user)).toMatchObject({isAdmin:false,repositoryId:42});expect(f.mock.calls[4][0]).toBe('https://api.github.com/repos/org/selected/collaborators/owner')})
 it('rejects public readability without a collaborator grant',async()=>{const {f,verify}=outside(false);await expect(verify(12,user)).rejects.toMatchObject({code:'access_denied'});expect(f).toHaveBeenCalledTimes(5)})
 it('rejects a collaborator response for a different numeric identity',async()=>{await expect(outside(true,99).verify(12,user)).rejects.toMatchObject({code:'access_denied'})})
 it('fails closed on permission API failure, not treating it as membership',async()=>{const f=vi.fn().mockResolvedValueOnce(Response.json(installation)).mockResolvedValueOnce(Response.json({token:'private'})).mockResolvedValueOnce(new Response(null,{status:403}));await expect(createInstallationVerifier('5',pem,f)(12,user)).rejects.toMatchObject({code:'permission_required'})})
})
