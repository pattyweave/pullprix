import type { Access } from './client'

export function soleTeamPath(access: Access): string | null {
  const [team] = access.organizations
  return access.organizations.length === 1 && team?.installationId
    ? `/teams/${team.installationId}`
    : null
}
