import { ProductError } from './model.ts'
import { GITHUB_API_VERSION, type GitHubInstallationTokenProvider } from '../_shared/github/token-provider.ts'
export type QueueContext = { organizationId: string; truncated: boolean;
  subject: { githubUserId: number; login: string };
  repositories: { id: string; githubId: number; name: string }[] }
type Actor = { login: string; __typename: string }
export type QueuePR = { number: number; title: string; isDraft: boolean; createdAt: string;
  author: Actor | null; reviewDecision: string | null;
  reviews: { nodes: { author: Actor | null; state: string }[]; pageInfo: { hasPreviousPage: boolean } } }
export type QueueItem = { id: string; repository: string; number: number; title: string; url: string;
  reason: 'required' | 'initial'; conflict: 'author' | 'reviewed' | null; openedAt: string }
/** Review workflow only: this queue makes no claim about scoring eligibility. */
export function queueItems(repository: QueueContext['repositories'][number], prs: QueuePR[], login: string) {
  const result: QueueItem[] = []
  for (const pr of prs) {
    if (pr.isDraft || pr.author?.__typename !== 'User' || !Number.isSafeInteger(pr.number) || pr.number < 1 ||
      !Number.isFinite(Date.parse(pr.createdAt)) || typeof pr.title !== 'string' || pr.reviews.pageInfo.hasPreviousPage) continue
    const reviews = pr.reviews.nodes.filter(r => r.author?.__typename === 'User')
    // Without a required-review decision, only advertise a first formal review.
    // Don't infer missing branch rules or invent additional approval requirements.
    const reason = pr.reviewDecision === 'REVIEW_REQUIRED' ? 'required' :
      pr.reviewDecision === null && reviews.length === 0 ? 'initial' : null
    const latest = new Map<string, string>()
    for (const review of reviews) latest.set(review.author!.login.toLowerCase(), review.state)
    if (!reason || [...latest.values()].includes('CHANGES_REQUESTED')) continue
    const conflict = pr.author.login.toLowerCase() === login.toLowerCase() ? 'author' :
      latest.has(login.toLowerCase()) ? 'reviewed' : null
    result.push({ id: `${repository.id}:${pr.number}`, repository: repository.name, number: pr.number,
      title: pr.title, url: `https://github.com/${repository.name}/pull/${pr.number}`,
      reason, conflict, openedAt: pr.createdAt })
  }
  return result
}
const query = `query($owner:String!,$name:String!) { repository(owner:$owner,name:$name) {
  databaseId pullRequests(first:100,states:OPEN,orderBy:{field:CREATED_AT,direction:ASC}) {
    pageInfo { hasNextPage } nodes { number title isDraft createdAt reviewDecision author { login __typename }
      reviews(last:100,states:[APPROVED,CHANGES_REQUESTED,COMMENTED]) {
        pageInfo { hasPreviousPage } nodes { state author { login __typename } }
      }
    }
  }
} }`
export function createReviewQueueLoader(url: string, apiKey: string, tokens: GitHubInstallationTokenProvider, transport: typeof fetch = fetch) {
  return async (userToken: string, installationId: number) => {
    const deadline = Date.now() + 15000
    const requestSignal = () => AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now())))
    const contextResponse = await transport(`${url}/rest/v1/rpc/get_review_queue_context`, {
      method: 'POST', headers: { apikey: apiKey, authorization: `Bearer ${userToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_installation_id: installationId }), signal: AbortSignal.timeout(10000), redirect: 'error',
    })
    if (!contextResponse.ok) throw new ProductError(contextResponse.status === 401 ? 401 : contextResponse.status === 403 ? 403 : 503,
      contextResponse.status === 401 ? 'sign_in_again' : contextResponse.status === 403 ? 'access_denied' : 'queue_unavailable')
    const context: QueueContext = await contextResponse.json()
    if (!/^[a-zA-Z0-9-]+$/.test(context.subject.login) || !Number.isSafeInteger(context.subject.githubUserId)) throw new ProductError(401, 'sign_in_again')
    let partial = context.truncated
    const items: QueueItem[] = []
    if (context.repositories.length) {
      const token = await tokens.get({ github_installation_id: installationId, repository_selection: 'selected', repository_ids: context.repositories.map(r => r.githubId) })
      const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': GITHUB_API_VERSION }
      // Bound concurrency and total work; omitted/unknown data is never presented as a complete zero.
      for (let offset = 0; offset < context.repositories.length; offset += 3) {
        if (Date.now() >= deadline) { partial = true; break }
        const results = await Promise.all(context.repositories.slice(offset, offset + 3).map(async repo => {
          if (!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(repo.name)) throw new Error('Invalid repository')
          const path = `https://api.github.com/repos/${repo.name}/collaborators/${context.subject.login}`
          const permissionResponse = await transport(`${path}/permission`, { headers, signal: requestSignal(), redirect: 'error' })
          if (permissionResponse.status === 404) return { items: [], partial: false }
          if (!permissionResponse.ok) throw new Error('Permission unavailable')
          const permission = await permissionResponse.json()
          if (permission.user?.id !== context.subject.githubUserId || !['read', 'write', 'admin'].includes(permission.permission)) return { items: [], partial: false }
          const [owner, name] = repo.name.split('/')
          const response = await transport('https://api.github.com/graphql', { method: 'POST', headers,
            body: JSON.stringify({ query, variables: { owner, name } }), signal: requestSignal(), redirect: 'error' })
          if (!response.ok) throw new Error('Queue unavailable')
          const data = await response.json(), repository = data.data?.repository
          if (data.errors?.length || repository?.databaseId !== repo.githubId || !Array.isArray(repository.pullRequests?.nodes)) throw new Error('Incomplete queue')
          const prs: QueuePR[] = repository.pullRequests.nodes
          return { items: queueItems(repo, prs, context.subject.login), partial: repository.pullRequests.pageInfo.hasNextPage || prs.some(pr => pr.reviews.pageInfo.hasPreviousPage) }
        }).map(promise => promise.catch(() => ({ items: [], partial: true }))))
        for (const result of results) { items.push(...result.items); partial ||= result.partial }
      }
    }
    items.sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt) || a.id.localeCompare(b.id))
    return { contractVersion: '1', organizationId: context.organizationId, generatedAt: new Date().toISOString(),
      status: partial ? 'partial' : 'complete', items, nextId: items.find(item => !item.conflict)?.id ?? null }
  }
}
