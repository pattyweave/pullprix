import type { TeamData } from './types'
export function TeamNotice({ data }: { data: TeamData }) {
  const repos = data.setup.repositories, manager = data.setup.canManage
  const failed = repos.some(r => r.status === 'failed'), stopped = repos.some(r => r.status === 'cancelled')
  const importing = repos.some(r => ['waiting', 'queued', 'running'].includes(r.status))
  const messages: string[] = []
  if (!repos.length) messages.push('No repositories are currently connected. If a repository was removed, its new activity will no longer be imported.')
  else if (data.removedRepositoryCount) messages.push('The selected repositories have changed. Removed repositories no longer import new activity.')
  if (failed) messages.push('Some repository imports need attention. Scores and review health may be incomplete until those imports finish.')
  if (stopped) messages.push('Some repository imports have stopped. Check the repository selection before continuing.')
  if (importing) messages.push(`Importing repository activity (${repos.filter(r => r.status === 'completed').length} of ${repos.length} complete). Scores and review health may change as it arrives. You can leave this page and come back.`)
  if (!messages.length) return null
  return <section role="status" aria-label="Team data status" className="mt-6 rounded-xl border border-line bg-surface p-5">
    {messages.map(message => <p key={message} className="mb-2 text-sm">{message}</p>)}
    {(failed || stopped || !repos.length || !!data.removedRepositoryCount) && <p className="text-sm">
      {manager ? <a href="#repository-setup" className="underline" onClick={() => document.getElementById('repository-setup')?.setAttribute('open', '')}>Review repository setup</a> : 'Ask an organization owner to check repository setup.'}
    </p>}
  </section>
}
