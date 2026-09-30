// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareTeamLink } from './ShareTeamLink'
import { teamEntryUrl } from './team-link'
Object.defineProperty(navigator, 'clipboard', {configurable:true,get:()=>undefined})
afterEach(() => {cleanup();vi.restoreAllMocks()})
describe('private team link', () => {
 it('copies a stable team URL without session, callback, query or fragment data', async () => {
  window.history.replaceState({},'', '/teams/12?code=not-a-real-code#private')
  const writeText=vi.fn().mockResolvedValue(undefined);vi.spyOn(navigator,'clipboard','get').mockReturnValue({writeText} as unknown as Clipboard)
  render(<ShareTeamLink installationId={12} />);fireEvent.click(screen.getByText('Copy team link'))
  await screen.findByRole('status');expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/teams/12`)
  expect(screen.getByLabelText('Team link').getAttribute('value')).toBe(`${window.location.origin}/teams/12`)
 })
 it('provides a manual copy fallback when clipboard is unavailable', async () => {
  vi.spyOn(navigator,'clipboard','get').mockReturnValue({writeText:vi.fn().mockRejectedValue(new Error('denied'))} as unknown as Clipboard)
  render(<ShareTeamLink installationId={12} />);fireEvent.click(screen.getByText('Copy team link'))
  expect((await screen.findByRole('status')).textContent).toContain('Copy this link')
  expect(screen.getByLabelText('Team link')).toBeTruthy()
 })
 it('uses the deployed origin and rejects invalid IDs', () => {
  expect(teamEntryUrl('https://pullprix.example/old?code=secret',12)).toBe('https://pullprix.example/teams/12')
  expect(()=>teamEntryUrl('https://pullprix.example',NaN)).toThrow();expect(()=>teamEntryUrl('https://pullprix.example',0)).toThrow()
 })
})
