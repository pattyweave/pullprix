// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {AuthPage} from './AuthPage'
const client=vi.hoisted(()=>({access:vi.fn(),signInUrl:vi.fn(),signOut:vi.fn(),finish:vi.fn()}))
vi.mock('./client',()=>({authClient:()=>client}))
afterEach(()=>{cleanup();vi.resetAllMocks();window.sessionStorage.clear();window.history.replaceState({},'', '/sign-in')})
describe('sign-in screen',()=>{
 it('keeps a single-team account page reachable for sign-out',async()=>{
  window.history.replaceState({},'', '/sign-in?account=1')
  client.access.mockResolvedValue({login:'human',organizations:[{id:'one',name:'One team',installationId:42}]})
  render(<AuthPage />)
  expect((await screen.findByRole('link',{name:'One team'})).getAttribute('href')).toBe('/teams/42')
  expect(screen.getByRole('button',{name:'Sign out'})).toBeTruthy()
 })

 it('lets a denied user inspect their account without bouncing back to the denied team',async()=>{
  window.history.replaceState({},'', '/sign-in?account=1&next=%2Fteams%2F12')
  client.access.mockResolvedValue({login:'wrong-user',organizations:[]});render(<AuthPage />)
  expect(await screen.findByText('Signed in as wrong-user.')).toBeTruthy()
  expect(screen.getByText(/If this is the wrong account/)).toBeTruthy()
  expect(window.sessionStorage.getItem('pullprix.setup-return')).toBe('/teams/12')
  client.signOut.mockResolvedValue(undefined);fireEvent.click(screen.getByText('Sign out'))
  expect(await screen.findByText('Continue with GitHub')).toBeTruthy()
 })
 it('shows sign-in and a retry error when redirect setup fails',async()=>{client.access.mockResolvedValue(null);client.signInUrl.mockRejectedValue(new Error('unconfigured'));render(<AuthPage/>);fireEvent.click(await screen.findByRole('button',{name:'Continue with GitHub'}));expect((await screen.findByRole('alert')).textContent).toContain('not configured')})
 it('distinguishes a signed-in user with no authorized team',async()=>{client.access.mockResolvedValue({login:'human',organizations:[]});render(<AuthPage/>);expect((await screen.findByText(/no team has granted/)).textContent).toContain('no team');client.signOut.mockResolvedValue(undefined);fireEvent.click(screen.getByRole('button',{name:'Sign out'}));expect(await screen.findByRole('button',{name:'Continue with GitHub'})).toBeTruthy()})
 it('never renders teams after authorization fails',async()=>{client.access.mockRejectedValue(new Error('Your session is no longer authorized.'));render(<AuthPage/>);expect((await screen.findByRole('alert')).textContent).toContain('no longer authorized');expect(screen.queryByRole('list')).toBeNull()})
})
