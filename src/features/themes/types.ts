import type { createSeasonSnapshot } from '../../../supabase/functions/_shared/season/snapshot'

export type SeasonSnapshot = ReturnType<typeof createSeasonSnapshot>
export interface ThemeVocabulary {
  participant: { singular: string; plural: string }
  standings: string
  points: string
  notStarted: string
  inactive: string
  finalStage: string
  champion: { singular: string; plural: string }
}
export interface ThemePack<State, View> {
  manifest: { id: string; version: string; supportedContractVersion: '1'; vocabulary: ThemeVocabulary }
  deriveMechanicState(snapshot: Readonly<SeasonSnapshot>): State
  buildViewModel(input: { snapshot: Readonly<SeasonSnapshot>; mechanicState: Readonly<State> }): View
}
