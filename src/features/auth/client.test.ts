import {describe,it,expect,vi} from 'vitest'
import {createAuthClient} from './client'
function storage():Storage {const map=new Map<string,string>();return {get length(){return map.size},clear:()=>map.clear(),getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v)},removeItem:k=>{map.delete(k)},key:i=>[...map.keys()][i]??null}}
const config={url:'https://db.test',publishableKey:'public'}
describe('browser sign-in',()=>{
 it('generates PKCE without tokens or arbitrary redirect targets',async()=>{const s=storage(),client=createAuthClient(config,s,'https://app.test',vi.fn());const url=new URL(await client.signInUrl());expect(url.searchParams.get('redirect_to')).toBe('https://app.test/auth/callback');expect(url.searchParams.get('code_challenge')).toHaveLength(43);expect(url.searchParams.get('code_challenge_method')).toBe('s256');expect(s.getItem('pullprix.pkce')).toHaveLength(43)})
 it('consumes verifier once and stores only application session',async()=>{const s=storage(),fetcher=vi.fn().mockResolvedValue(Response.json({accessToken:'a',refreshToken:'r',expiresAt:Date.now()+3600000})),client=createAuthClient(config,s,'https://app.test',fetcher);await client.signInUrl();await client.finish('code');expect(s.getItem('pullprix.pkce')).toBeNull();expect(JSON.parse(s.getItem('pullprix.session')!).accessToken).toBe('a');await expect(client.finish('code')).rejects.toThrow('expired')})
 it('clears invalid sessions and never treats failure as organization access',async()=>{const s=storage();s.setItem('pullprix.session',JSON.stringify({accessToken:'a',refreshToken:'r',expiresAt:Date.now()+3600000}));const client=createAuthClient(config,s,'https://app.test',vi.fn().mockResolvedValue(new Response(null,{status:403})));await expect(client.access()).rejects.toThrow('no longer authorized');expect(s.getItem('pullprix.session')).toBeNull()})
 it('refreshes expired app sessions then reads current membership',async()=>{const s=storage();s.setItem('pullprix.session',JSON.stringify({accessToken:'old',refreshToken:'r',expiresAt:0}));const fetcher=vi.fn().mockResolvedValueOnce(Response.json({accessToken:'new',refreshToken:'next',expiresAt:Date.now()+3600000})).mockResolvedValueOnce(Response.json({login:'human',organizations:[]}));expect(await createAuthClient(config,s,'https://app.test',fetcher).access()).toMatchObject({organizations:[]});expect(fetcher.mock.calls[1]![1].headers.authorization).toBe('Bearer new')})
 it('clears local credentials even if logout fails',async()=>{const s=storage();s.setItem('pullprix.session',JSON.stringify({accessToken:'a',refreshToken:'r',expiresAt:Date.now()+3600000}));const client=createAuthClient(config,s,'https://app.test',vi.fn().mockRejectedValue(new Error('offline')));await expect(client.signOut()).rejects.toThrow();expect(s.getItem('pullprix.session')).toBeNull()})
})
describe('product API session transport', () => {
 it('requires sign-in before sending product queries', async () => {
  const fetcher=vi.fn(), client=createAuthClient(config,storage(),'https://app.test',fetcher)
  await expect(client.product({installationId:42,resource:'season'})).rejects.toThrow('sign_in_again')
  expect(fetcher).not.toHaveBeenCalled()
 })
 it('refreshes the session and sends bounded query parameters without putting tokens in URLs', async () => {
  const s=storage();s.setItem('pullprix.session',JSON.stringify({accessToken:'old',refreshToken:'r',expiresAt:0}))
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({accessToken:'new',refreshToken:'next',expiresAt:Date.now()+3600000}))
   .mockResolvedValueOnce(Response.json({items:[],nextOffset:null}))
  const client=createAuthClient(config,s,'https://app.test',fetcher)
  await expect(client.product({installationId:42,resource:'standings',limit:10,offset:0})).resolves.toMatchObject({items:[]})
  const [url, options]=fetcher.mock.calls[1]!
  expect(url).toBe('https://db.test/functions/v1/product-api?installationId=42&resource=standings&limit=10&offset=0')
  expect(options.headers.authorization).toBe('Bearer new')
 })
 it('keeps the session on denied team access so the provider can reverify membership', async () => {
  const s=storage();s.setItem('pullprix.session',JSON.stringify({accessToken:'a',refreshToken:'r',expiresAt:Date.now()+3600000}))
  const client=createAuthClient(config,s,'https://app.test',vi.fn().mockResolvedValue(Response.json({error:'access_denied'},{status:403})))
  await expect(client.product({installationId:42,resource:'season'})).rejects.toThrow('access_denied')
  expect(s.getItem('pullprix.session')).not.toBeNull()
 })
})
