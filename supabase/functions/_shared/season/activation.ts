import { seasonAt } from '../scoring/season.ts'
/** Global pilot release. Customers have no season/theme/scoring controls. */
export function activeSeason(at = new Date().toISOString()) {
  const calendar = seasonAt(at)
  const finalStageStartsAt = new Date(Date.parse(calendar.endsAt) - 72 * 3600000).toISOString()
  return { ...calendar, definitionVersion: 1, name: 'Pull Prix Championship',
    themePack: { id: 'racing' as const, version: '1.0.0' }, scoringPolicyVersion: 'v1' as const,
    finalStageStartsAt, phase: Date.parse(at) >= Date.parse(finalStageStartsAt) ? 'final_stage' as const : 'active' as const,
    generatedAt: at }
}
