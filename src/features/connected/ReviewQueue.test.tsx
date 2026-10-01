// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReviewQueue, ReviewQueueView } from './ReviewQueue'
import { readQueue, type ReviewQueueData } from './review-queue-data'
const client = vi.hoisted(() => ({ product: vi.fn() }))
vi.mock('../auth/client', () => ({ authClient: () => client }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); client.product.mockReset() })
const data = (): ReviewQueueData => ({ contractVersion: '1', organizationId: 'org', generatedAt: '2026-10-01T12:00:00Z', status: 'complete', nextId: '2',
  items: Array.from({ length: 7 }, (_, i) => ({ id: String(i), repository: 'team/repo', number: i + 1, title: `PR ${i + 1}`, url: `https://github.com/team/repo/pull/${i + 1}`,
    reason: 'required', conflict: i === 0 ? 'author' : i === 1 ? 'reviewed' : null, openedAt: '2026-10-01T00:00:00Z' })) })
it('shows a linked personal suggestion and expandable queue with conflicts and more results', () => {
  render(<ReviewQueueView data={data()} loading={false} retry={vi.fn()} />)
  expect(screen.getByText('7 PRs needing review')).toBeTruthy()
  expect(document.querySelector('.race-next-pr')?.getAttribute('href')).toBe('https://github.com/team/repo/pull/3')
  expect(screen.getByText('Your PR')).toBeTruthy()
  expect(screen.getByText('You’ve reviewed this')).toBeTruthy()
  expect(screen.queryByText('PR 7')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Show more (2)', hidden: true }))
  expect(screen.getByText('PR 7')).toBeTruthy()
})
it('does not mistake partial or failed data for an empty queue', () => {
  const d = data(); d.items = []; d.nextId = null; d.status = 'partial'
  const view = render(<ReviewQueueView data={d} loading={false} retry={vi.fn()} />)
  expect(screen.getByText(/may be incomplete/)).toBeTruthy()
  expect(screen.queryByText(/All clear/)).toBeNull()
  view.rerender(<ReviewQueueView data={null} loading={false} retry={vi.fn()} />)
  expect(screen.getByText(/Review queue unavailable/)).toBeTruthy()
})
it('rejects another team, unsafe links and conflicting personal recommendations', () => {
  expect(() => readQueue(data(), 'another')).toThrow()
  const bad = data(); bad.items[0]!.url = 'https://evil.test'; expect(() => readQueue(bad, 'org')).toThrow()
  const own = data(); own.nextId = '0'; expect(() => readQueue(own, 'org')).toThrow()
  expect(readQueue(data(), 'org').items).toHaveLength(7)
})

it('refreshes once per minute, skips hidden pages, and clears data on permission loss', async () => {
  vi.useFakeTimers()
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  client.product.mockResolvedValue(data())
  const view = render(<ReviewQueue installationId={99} organizationId="org" />)
  await act(async () => {})
  expect(client.product).toHaveBeenCalledTimes(1)
  await act(async () => { vi.advanceTimersByTime(15000) })
  expect(client.product).toHaveBeenCalledTimes(1)
  await act(async () => { vi.advanceTimersByTime(45000) })
  expect(client.product).toHaveBeenCalledTimes(2)
  visibility.mockReturnValue('hidden')
  await act(async () => { vi.advanceTimersByTime(60000) })
  expect(client.product).toHaveBeenCalledTimes(2)
  visibility.mockReturnValue('visible')
  client.product.mockRejectedValue(new Error('access_denied'))
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(screen.queryByText('7 PRs needing review')).toBeNull()
  expect(screen.getByText(/Review queue unavailable/)).toBeTruthy()
  await act(async () => { vi.advanceTimersByTime(60000) })
  expect(client.product).toHaveBeenCalledTimes(3)
  view.unmount()
  await act(async () => { vi.advanceTimersByTime(60000) })
  expect(client.product).toHaveBeenCalledTimes(3)
})
