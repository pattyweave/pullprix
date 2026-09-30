// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SeasonHistory } from './SeasonHistory'
const client=vi.hoisted(()=>({installationSetup:vi.fn(),product:vi.fn()}))
vi.mock('../auth/client',()=>({authClient:()=>client}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
function start(items: unknown[] = []) {
 client.installationSetup.mockResolvedValue({setup:{status:'ready',organization:{id:'org'}}})
 client.product.mockResolvedValue({contractVersion:'1',organizationId:'org',items,nextOffset:null})
 render(<SeasonHistory installationId={42}/> )
}
it('shows an honest empty history and current-season link', async()=>{
 start();expect(await screen.findByText(/first season is still underway/)).toBeTruthy()
 expect(screen.getByText('Back to current season').getAttribute('href')).toBe('/teams/42')
})
it('shows finalizing results separately from the running season',async()=>{
 start([{seasonId:'2026-08',status:'finalizing'}]);await screen.findByText('Season 2026-08')
 client.product.mockResolvedValue({contractVersion:'1',organizationId:'org',seasonId:'2026-08',status:'finalizing',snapshot:null})
 fireEvent.click(screen.getByText('Season 2026-08'));expect(await screen.findByText(/Results are still finalizing/)).toBeTruthy()
 expect(client.product).toHaveBeenLastCalledWith(expect.objectContaining({resource:'archive',seasonId:'2026-08'}))
})
it('clears previous private history when access is revoked',async()=>{
 start([{seasonId:'2026-08',status:'completed'}]);await screen.findByText('Season 2026-08')
 client.installationSetup.mockRejectedValue(new Error('access_denied'))
 fireEvent.click(screen.getByText('Season 2026-08'));await screen.findByRole('alert')
 expect(screen.queryByText('Season 2026-08')).toBeNull()
})
it('rejects a cross-organization response',async()=>{
 start();client.product.mockResolvedValue({contractVersion:'1',organizationId:'other',items:[],nextOffset:null})
 expect(await screen.findByRole('alert')).toBeTruthy()
})
