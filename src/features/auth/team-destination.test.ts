import { describe, expect, it } from 'vitest'
import { soleTeamPath } from './team-destination'
import type { Access } from './client'
const team = { id: 'one', name: 'One', slug: 'one', installationId: 42 }
const access = (organizations: Access['organizations']): Access => ({ githubUserId: 1, login: 'human', avatarUrl: null, organizations })
describe('sign-in team destination', () => {
  it('opens the only team with an installation', () => {
    expect(soleTeamPath(access([team]))).toBe('/teams/42')
  })
  it('keeps selection for multiple teams and the account screen for no usable team', () => {
    expect(soleTeamPath(access([team, { ...team, id: 'two', installationId: 43 }]))).toBeNull()
    expect(soleTeamPath(access([]))).toBeNull()
    expect(soleTeamPath(access([{ ...team, installationId: null }]))).toBeNull()
  })
})
