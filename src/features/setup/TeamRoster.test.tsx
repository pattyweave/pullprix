// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TeamRoster } from './TeamRoster'
import type { RosterParticipant } from './types'
const human: RosterParticipant = { id:'p1',githubUserId:1,login:'reviewer',displayName:'Reviewer',avatarUrl:null,active:true,joinedAt:'2026-09-01T00:00:00Z' }
afterEach(cleanup)
describe('automatic team roster', () => {
 it('shows people without requiring invitations or assigning invented ranks or points', () => {
   render(<TeamRoster participants={[human]} importing={false} />)
   expect(screen.getByText('@reviewer')).toBeTruthy(); expect(screen.getByText('1 active')).toBeTruthy()
   expect(screen.queryByRole('button')).toBeNull(); expect(screen.queryByText(/points/)).toBeNull()
 })
 it('keeps departed participants visible with neutral status', () => {
   render(<TeamRoster participants={[{...human,active:false}]} importing={false} />)
   expect(screen.getByText('0 active · 1 inactive')).toBeTruthy(); expect(screen.getByText('Inactive · contribution history retained')).toBeTruthy()
 })
 it('distinguishes an unfinished import from a completed empty roster', () => {
   const {rerender}=render(<TeamRoster participants={[]} importing={true} />)
   expect(screen.getByText('Finding your team’s contributors…')).toBeTruthy()
   rerender(<TeamRoster participants={[]} importing={false} />)
   expect(screen.getByText(/No eligible contributors yet/)).toBeTruthy(); expect(screen.queryByText(/Finding/)).toBeNull()
 })
 it('falls back for blank display names and missing, failed or untrusted avatars', () => {
   const {container,rerender}=render(<TeamRoster participants={[{...human,displayName:' ',avatarUrl:'https://untrusted.test/avatar'}]} importing={false} />)
   expect(screen.getByText('reviewer')).toBeTruthy(); expect(container.querySelector('img')).toBeNull()
   rerender(<TeamRoster participants={[{...human,avatarUrl:'https://avatars.githubusercontent.com/u/1'}]} importing={false} />)
   const image=container.querySelector('img')!; expect(image).toBeTruthy(); fireEvent.error(image)
   expect(container.querySelector('img')).toBeNull(); expect(screen.getByText('RE')).toBeTruthy()
 })
})
