import type { QueueItem } from '../../../supabase/functions/product-api/review-queue'
export type ReviewQueueData = { contractVersion: '1'; organizationId: string; generatedAt: string;
  status: 'complete' | 'partial'; items: QueueItem[]; nextId: string | null }
export function readQueue(value: unknown, organizationId: string): ReviewQueueData {
  const data = value as ReviewQueueData
  if (!data || data.contractVersion !== '1' || data.organizationId !== organizationId ||
    !['complete', 'partial'].includes(data.status) || !Number.isFinite(Date.parse(data.generatedAt)) ||
    !Array.isArray(data.items) || data.items.length > 1000 || data.items.some(item =>
      typeof item.id !== 'string' || typeof item.title !== 'string' ||
      !/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(item.repository) || !Number.isSafeInteger(item.number) || item.number < 1 ||
      item.url !== `https://github.com/${item.repository}/pull/${item.number}` ||
      !['required', 'initial'].includes(item.reason) || ![null, 'author', 'reviewed'].includes(item.conflict)) ||
    new Set(data.items.map(item => item.id)).size !== data.items.length ||
    (data.nextId !== null && !data.items.some(item => item.id === data.nextId && item.conflict === null))) throw new Error('Invalid queue')
  return data
}
