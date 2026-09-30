// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstallationPage } from './InstallationPage'
import { activeSeason } from '../../../supabase/functions/_shared/season/activation'
const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../auth/client', () => ({ authClient: () => ({ installationSetup: load }) }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const ready = { setup: { status: 'ready', canManage:true, role:'administrator', organization: { id:'org', name:'Team' }, repositories: [{name:'Team/repo',status:'failed',pagesCompleted:4}] }, season: activeSeason() }
describe('installation status page', () => {
 it('offers an account check on denied links without exposing team data',async()=>{
  window.history.replaceState({},'', '/teams/12');load.mockRejectedValue(new Error('access_denied'));render(<InstallationPage />)
  const link=await screen.findByText('Check your signed-in account')
  expect(link.getAttribute('href')).toBe('/sign-in?account=1&next=%2Fteams%2F12')
  expect(screen.queryByText('Team/repo')).toBeNull();expect(screen.queryByText('Copy team link')).toBeNull()
 })
 it('lets spectators view the team without exposing installation actions', async () => {
  window.history.replaceState({},'', '/teams/12'); load.mockResolvedValue({...ready,setup:{...ready.setup,canManage:false,role:'spectator'}}); render(<InstallationPage />)
  await screen.findByText('0 of 1 repositories imported.')
  expect(screen.queryByText('Copy team link')).toBeNull();expect(screen.queryByText('Retry failed imports')).toBeNull();expect(screen.queryByText('GitHub installation settings')).toBeNull()
  expect(screen.getByText('Refresh status')).toBeTruthy()
 })
 it('preserves only a safe installation destination through sign-in', async () => {
   window.history.replaceState({},'', '/installations/callback?installation_id=12&next=https://evil.test')
   load.mockRejectedValue(new Error('sign_in_again')); render(<InstallationPage />)
   const link = await screen.findByText('Sign in with GitHub')
   expect(link.getAttribute('href')).toBe('/sign-in?next=%2Finstallations%2Fcallback%3Finstallation_id%3D12')
 })
 it('does not request an invalid installation', async () => {
   window.history.replaceState({},'', '/installations/callback?installation_id=-2'); render(<InstallationPage />)
   expect((await screen.findByRole('alert')).textContent).toContain('incomplete'); expect(load).not.toHaveBeenCalled()
 })
 it('shows partial progress and retries only when requested', async () => {
   window.history.replaceState({},'', '/teams/12'); load.mockResolvedValue(ready); render(<InstallationPage />)
   await screen.findByText('0 of 1 repositories imported.'); expect(screen.getByText('Pull Prix Championship')).toBeTruthy(); expect(load).toHaveBeenLastCalledWith(12,false)
   fireEvent.click(screen.getByText('Refresh status')); await waitFor(() => expect(load).toHaveBeenCalledTimes(2)); expect(load).toHaveBeenLastCalledWith(12,false)
   await screen.findByText('Retry failed imports'); fireEvent.click(screen.getByText('Retry failed imports'))
   await waitFor(() => expect(load).toHaveBeenLastCalledWith(12,true))
 })
 it('renders permission recovery without exposing team details', async () => {
   window.history.replaceState({},'', '/teams/12'); load.mockRejectedValue(new Error('permission_required')); render(<InstallationPage />)
   expect((await screen.findByRole('alert')).textContent).toContain('Members read-only'); expect(screen.queryByText('Team/repo')).toBeNull()
 })
})
