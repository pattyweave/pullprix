// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamPage } from './TeamDashboard'
import { fixture, mockClient } from './fixtures.test-support'
const state = vi.hoisted(() => ({ client: null as ReturnType<typeof mockClient> | null }))
vi.mock('../track/usePathSampler', () => ({ usePathSampler: () => ({ length: 100, pointAt: (t: number) => ({ x: t * 100, y: 0, angle: 0 }) }) }))
vi.mock('../auth/client', () => ({ authClient: () => state.client }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
function start(data = fixture()) {
  state.client = mockClient(data); window.history.replaceState({}, '', '/teams/42')
  return render(<TeamPage />)
}
describe('PP-061 connected dashboard', () => {
  it('renders live scores, unranked beginners and explicit unavailable health', async () => {
    start()
    expect(screen.getByRole('status').textContent).toContain('Loading your team')
    await screen.findByRole('heading', { name: 'Live Team' })
    expect(screen.getByText('On the Start Line')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('Unavailable')).toBeTruthy()
    expect(screen.queryByText('Standings are not available on this setup page yet.')).toBeNull()
    expect(screen.queryByText('Apex Predator')).toBeNull()
    expect(screen.getByText('Copy team link')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Suzuka with 2 drivers' })).toBeTruthy()
    fireEvent.click(document.querySelector('[data-driver="zero"]')!)
    expect(screen.getByLabelText('Selected driver stats').textContent).toContain('New Driver')
  })
  it('lets mobile users switch views and inspect the selected driver', async () => {
    start(); await screen.findByRole('heading', { name: 'Live Team' })
    fireEvent.click(screen.getByRole('button', { name: 'Standings' }))
    expect(screen.getByRole('main').getAttribute('data-view')).toBe('standings')
    fireEvent.click(document.querySelector('[data-driver="zero"]')!)
    expect(screen.getByLabelText('Selected driver stats').textContent).toContain('New Driver')
    fireEvent.click(screen.getByRole('button', { name: 'Pit wall' }))
    expect(screen.getByRole('main').getAttribute('data-view')).toBe('pit')
    expect(screen.getByText('Switch team').getAttribute('href')).toBe('/sign-in?account=1')
    fireEvent.click(screen.getByRole('button', { name: 'Track' }))
    expect(screen.getByRole('main').getAttribute('data-view')).toBe('track')
  })
  it('shows real point gaps and keeps management controls collapsed until requested', async () => {
    const data = fixture()
    data.participants[1]!.points = 3; data.participants[1]!.rank = 2; data.season.totalPoints += 3
    start(data); await screen.findByRole('heading', { name: 'Live Team' })
    expect(screen.getByText('Leader')).toBeTruthy()
    expect(screen.getByText(`${data.participants[0]!.points - 3} pts to lead`)).toBeTruthy()
    expect(document.querySelector('details.race-operations')?.hasAttribute('open')).toBe(false)
    expect(screen.queryByText('Championship driver')).toBeNull()
  })
  it('paints the selected tied driver above peers and every marker above the start stripe', async () => {
    const data = fixture()
    data.participants[1]!.points = data.participants[0]!.points
    data.participants[1]!.rank = 1; data.participants[1]!.tied = true; data.participants[0]!.tied = true
    data.season.totalPoints = data.participants[0]!.points * 2
    start(data); await screen.findByRole('heading', { name: 'Live Team' })
    const markerIds = () => [...document.querySelectorAll('[data-driver]')].map(e => e.getAttribute('data-driver'))
    expect(markerIds().at(-1)).toBe('reviewer')
    fireEvent.click(document.querySelector('[data-driver="zero"]')!)
    expect(markerIds().at(-1)).toBe('zero')
    const stripe = document.querySelector('[data-track-start]')!
    for (const marker of document.querySelectorAll('[data-driver]')) {
      expect(stripe.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
  it('explains pending scoring and names the qualifying review metric', async () => {
    start(); await screen.findByRole('heading', { name: 'Live Team' })
    expect(screen.getByText('Qualifying reviews')).toBeTruthy()
    expect(screen.getByText(/1 pull request awaiting scoring. These metrics/)).toBeTruthy()
    expect(screen.getByText(/Counted once per reviewer per PR/)).toBeTruthy()
    expect(screen.queryByText('Useful reviews')).toBeNull()
  })
  it('scrubs actual samples and returns to current data without historical health claims', async () => {
    start(); await screen.findByRole('heading', { name: 'Live Team' })
    fireEvent.change(screen.getByLabelText('Live'), { target: { value: '0' } })
    expect(screen.getByText('Review health is available in the live view.')).toBeTruthy()
    expect(screen.getByRole('img', { name: /with 1 drivers/ })).toBeTruthy()
    fireEvent.click(screen.getByText('Back to live'))
    expect(screen.getByText('50%')).toBeTruthy()
  })
  it('removes all private data when refreshing finds revoked access', async () => {
    start(); await screen.findByRole('heading', { name: 'Live Team' })
    state.client!.product.mockRejectedValue(new Error('access_denied'))
    state.client!.installationSetup.mockRejectedValue(new Error('access_denied'))
    fireEvent.click(screen.getByText('Refresh'))
    await screen.findByRole('alert')
    expect(screen.queryByText('Real Reviewer')).toBeNull()
    expect(screen.queryByText('Live Team')).toBeNull()
    expect(screen.getByText('Check your signed-in account').getAttribute('href')).toBe('/sign-in?account=1&next=%2Fteams%2F42')
  })
  it('keeps a scoped sign-in destination and offers a retry for network errors', async () => {
    state.client = mockClient(); state.client.installationSetup.mockRejectedValue(new Error('sign_in_again'))
    window.history.replaceState({}, '', '/teams/42'); render(<TeamPage />)
    expect((await screen.findByText('Sign in with GitHub')).getAttribute('href')).toBe('/sign-in?next=%2Fteams%2F42')
    cleanup(); start(); await screen.findByRole('heading', { name: 'Live Team' })
    state.client!.product.mockRejectedValueOnce(new Error('offline')); fireEvent.click(screen.getByText('Refresh'))
    await screen.findByText('Try again'); fireEvent.click(screen.getByText('Try again'))
    await screen.findByRole('heading', { name: 'Live Team' })
  })
  it('hides management actions for spectators', async () => {
    const data = fixture(); data.setup.canManage = false; data.setup.role = 'spectator'; start(data)
    await screen.findByRole('heading', { name: 'Live Team' })
    expect(screen.queryByText('Copy team link')).toBeNull()
    expect(screen.queryByText('GitHub installation settings')).toBeNull()
  })
  it('polls while visible and refreshes immediately on focus', async () => {
    vi.useFakeTimers()
    const data = fixture()
    await act(async () => { start(data) })
    data.season.totalPoints = 16; data.participants[0]!.points = 16
    const before = state.client!.product.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(state.client!.product.mock.calls.length).toBeGreaterThan(before)
    expect(screen.getAllByText('16')).toHaveLength(2)
    const afterPoll = state.client!.product.mock.calls.length
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(state.client!.product.mock.calls.length).toBe(afterPoll)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(state.client!.product.mock.calls.length).toBeGreaterThan(afterPoll)
    expect(screen.getByRole('heading', { name: 'Live Team' })).toBeTruthy()
  })
  it('changes team without displaying the previous cache', async () => {
    const view = start(); await screen.findByRole('heading', { name: 'Live Team' })
    state.client = mockClient(); state.client.installationSetup.mockRejectedValue(new Error('access_denied'))
    window.history.replaceState({}, '', '/teams/43'); view.rerender(<TeamPage />)
    expect(screen.queryByText('Live Team')).toBeNull()
    await screen.findByRole('alert')
    expect(state.client.installationSetup).toHaveBeenCalledWith(43, false)
  })
  it('deduplicates StrictMode mounts and still renders the loaded team', async () => {
    // Keep the fixture season active; season-end refresh is a separate behavior.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-28T20:00:00Z'))
    state.client = mockClient(); window.history.replaceState({}, '', '/teams/42')
    render(<StrictMode><TeamPage /></StrictMode>)
    await screen.findByRole('heading', { name: 'Live Team' })
    expect(state.client.installationSetup).toHaveBeenCalledTimes(1)
  })
  it('does not request invalid team links', () => {
    state.client = mockClient(); window.history.replaceState({}, '', '/teams/-1'); render(<TeamPage />)
    expect(screen.getByRole('alert').textContent).toContain('incomplete')
    expect(state.client.installationSetup).not.toHaveBeenCalled()
  })
})

describe('PP-064 recovery and imperfect data', () => {
  it.each([
    ['permission_required', 'Members read-only'],
    ['installation_unavailable', 'unavailable or suspended'],
    ['waiting_for_webhook', 'installation to arrive'],
    ['github_busy', 'GitHub is limiting'],
    ['github_unavailable', 'reach GitHub'],
    ['verification_limit', 'finish checking'],
    ['product_unavailable', 'temporarily unavailable'],
    ['no_active_season', 'no active season'],
  ])('explains %s and recovers after retry', async (error, message) => {
    state.client = mockClient(); state.client.installationSetup.mockRejectedValueOnce(new Error(error))
    window.history.replaceState({}, '', '/teams/42'); render(<TeamPage />)
    expect((await screen.findByRole('alert')).textContent).toContain(message)
    expect(screen.queryByText('Real Reviewer')).toBeNull()
    fireEvent.click(screen.getByText('Try again'))
    await screen.findByRole('heading', { name: 'Live Team' })
  })
  it('makes ongoing imports visible and opens setup from an import failure', async () => {
    const data = fixture(); data.setup.repositories[0]!.status = 'running'; start(data)
    expect((await screen.findByRole('status', { name: 'Team data status' })).textContent).toContain('Importing repository activity (0 of 1 complete)')
    cleanup(); data.setup.repositories[0]!.status = 'failed'; start(data)
    await screen.findByText('Review repository setup')
    fireEvent.click(screen.getByText('Review repository setup'))
    expect(document.getElementById('repository-setup')?.hasAttribute('open')).toBe(true)
    expect(document.querySelector('details.race-operations')?.hasAttribute('open')).toBe(true)
    fireEvent.click(screen.getByText('Retry failed imports'))
    await act(async () => {})
    expect(state.client!.installationSetup).toHaveBeenCalledWith(42, true)
  })
  it('directs spectators to an owner when imports stop', async () => {
    const data = fixture(); data.setup.canManage = false; data.setup.role = 'spectator'; data.setup.repositories[0]!.status = 'cancelled'; start(data)
    await screen.findByText('Ask an organization owner to check repository setup.')
    expect(screen.queryByText('Retry failed imports')).toBeNull()
    expect(screen.queryByText('GitHub installation settings')).toBeNull()
  })
  it('distinguishes no repositories, an empty roster, and a zero-point roster', async () => {
    const data = fixture(); data.setup.repositories = []; data.participants = []; data.season.participantCount = 0; data.season.totalPoints = 0; start(data)
    await screen.findByText('Connect a repository to begin importing your team’s activity.')
    expect(screen.getByRole('status', { name: 'Team data status' }).textContent).toContain('No repositories are currently connected')
    cleanup(); data.setup.repositories = fixture().setup.repositories; start(data)
    await screen.findByText(/Open a PR or submit a formal review/)
    cleanup(); data.participants = [fixture().participants[1]!]; data.season.participantCount = 1; start(data)
    await screen.findByText(/No points earned yet/)
  })
  it('shows incomplete health explicitly with a recovery action', async () => {
    start(); await screen.findByRole('heading', { name: 'Live Team' })
    expect(screen.getByText(/These metrics reflect verified activity so far/)).toBeTruthy()
    expect(screen.getByText('Unavailable')).toBeTruthy()
    expect(screen.getByText('Refresh')).toBeTruthy()
  })
  it('pauses automatic checks for permission failures but allows manual recovery', async () => {
    vi.useFakeTimers(); state.client = mockClient(); state.client.installationSetup.mockRejectedValueOnce(new Error('permission_required'))
    window.history.replaceState({}, '', '/teams/42')
    await act(async () => { render(<TeamPage />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(120000) })
    expect(state.client.installationSetup).toHaveBeenCalledTimes(1)
    await act(async () => { fireEvent.click(screen.getByText('Try again')) })
    expect(screen.getByRole('heading', { name: 'Live Team' })).toBeTruthy()
  })
  it('backs off automatic checks when GitHub rate limits the app', async () => {
    vi.useFakeTimers(); state.client = mockClient(); state.client.installationSetup.mockRejectedValueOnce(new Error('github_busy'))
    window.history.replaceState({}, '', '/teams/42')
    await act(async () => { render(<TeamPage />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(45000) })
    expect(state.client.installationSetup).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(screen.getByRole('heading', { name: 'Live Team' })).toBeTruthy()
  })
})
