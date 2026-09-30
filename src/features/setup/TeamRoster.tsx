import { useState } from 'react'
import type { RosterParticipant } from './types'
function Avatar({ participant }: { participant: RosterParticipant }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const url = participant.avatarUrl
  const valid = url !== null && /^https:\/\/avatars\.githubusercontent\.com\//.test(url)
  const fallback = (participant.displayName.trim() || participant.login).slice(0, 2).toUpperCase()
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface text-sm font-semibold" aria-hidden="true">
    {valid && failedUrl !== url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} /> : fallback}
  </span>
}
export function TeamRoster({ participants, importing }: { participants: RosterParticipant[]; importing: boolean }) {
  const active = participants.filter(person => person.active).length
  return <section className="mt-8" aria-labelledby="team-roster-heading">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="team-roster-heading" className="text-xl font-semibold">Team roster</h2>
      <p className="text-sm text-text-faint">{active} active{participants.length > active ? ` · ${participants.length - active} inactive` : ''}</p>
    </div>
    <p className="mt-3 text-sm text-text-faint">Built automatically from PR authors and reviewers in your selected repositories, starting with the past 60 days. New contributors join as they participate.</p>
    {importing && <p className="mt-3 text-sm">The roster may grow as historical activity finishes importing.</p>}
    {!participants.length ? <p className="mt-4 rounded border border-line p-4">{importing ? 'Finding your team’s contributors…' : 'No eligible contributors yet. People will appear automatically after authoring a PR or submitting a formal review in a selected repository.'}</p> :
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">{participants.map(person => <li key={person.id} className="flex min-w-0 items-center gap-3 rounded border border-line p-4">
        <Avatar participant={person} />
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{person.displayName.trim() || person.login}</p>
          <p className="break-words text-sm text-text-faint">@{person.login}</p>
          {!person.active && <p className="mt-1 text-sm text-text-faint">Inactive · contribution history retained</p>}
        </div>
      </li>)}</ul>}
  </section>
}
