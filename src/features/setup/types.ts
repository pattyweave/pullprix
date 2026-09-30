export type RosterParticipant = {
  id: string; githubUserId: number; login: string; displayName: string
  avatarUrl: string | null; active: boolean; joinedAt: string
}
export type InstallationSetup = {
  setup: { status: 'waiting_for_webhook' } | {
    status: 'ready'; role: 'administrator' | 'participant' | 'spectator'; canManage: boolean; roster: RosterParticipant[]; organization: { id: string; name: string; slug: string }
    repositories: { name: string; status: 'waiting' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; pagesCompleted: number }[]
  }
  season: ReturnType<typeof import('../../../supabase/functions/_shared/season/activation').activeSeason>
}
