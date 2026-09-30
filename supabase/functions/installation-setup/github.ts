import { createGitHubAppJwt, importGitHubPrivateKey } from '../_shared/github/jwt.ts'
import { GITHUB_API_VERSION } from '../_shared/github/token-provider.ts'

export class SetupError extends Error {
  constructor(readonly code: string, readonly status = 403) { super(code) }
}
export type VerifiedInstallation = { accountId: number; accountLogin: string; accountType: 'User' | 'Organization'; isAdmin: boolean; repositoryId: number | null }
export function createInstallationVerifier(appId: string, pem: string, fetcher: typeof fetch = fetch) {
  let key: Promise<CryptoKey> | undefined
  async function request(path: string, token: string, body?: unknown, allowMissing = false) {
    const response = await fetcher(`https://api.github.com${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
        'x-github-api-version': GITHUB_API_VERSION, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0') throw new SetupError('github_busy', 503)
    if (response.status === 404 && allowMissing) return null
    if (response.status === 204) return true
    if (response.status === 404) throw new SetupError('access_denied')
    if (response.status === 403 || response.status === 422) throw new SetupError('permission_required')
    if (!response.ok) throw new SetupError('github_unavailable', 503)
    return response.json()
  }
  return async (installationId: number, user: { githubUserId: number; login: string }): Promise<VerifiedInstallation> => {
    const deadline = Date.now() + 20000
    key ??= importGitHubPrivateKey(pem)
    const jwt = await createGitHubAppJwt(appId, await key)
    const installation = await request(`/app/installations/${installationId}`, jwt)
    const account = installation.account
    if (installation.id !== installationId || installation.app_id !== Number(appId) || installation.suspended_at ||
      !Number.isSafeInteger(account?.id) || !/^[a-zA-Z0-9-]+$/.test(account?.login ?? '') ||
      !['User', 'Organization'].includes(account?.type)) throw new SetupError('installation_unavailable')
    const result = (isAdmin: boolean, repositoryId: number | null = null): VerifiedInstallation =>
      ({ accountId: account.id, accountLogin: account.login, accountType: account.type, isAdmin, repositoryId })
    if (account.type === 'User' && account.id === user.githubUserId) return result(true)
    if (!/^[a-zA-Z0-9-]+$/.test(user.login)) throw new SetupError('sign_in_again', 401)
    const organization = account.type === 'Organization'
    if (organization && !['read', 'write'].includes(installation.permissions?.members)) throw new SetupError('permission_required')
    // Only metadata and, for organizations, membership reads. Tokens stay in memory.
    const token = await request(`/app/installations/${installationId}/access_tokens`, jwt,
      { permissions: { metadata: 'read', ...(organization ? { members: 'read' } : {}) } })
    if (typeof token.token !== 'string' || !token.token) throw new SetupError('github_unavailable', 503)
    if (organization) {
      const membership = await request(`/orgs/${account.login}/memberships/${user.login}`, token.token, undefined, true)
      if (membership !== null) {
        if (membership.user?.id !== user.githubUserId || membership.organization?.id !== account.id ||
          membership.state !== 'active' || !['admin', 'member'].includes(membership.role)) throw new SetupError('access_denied')
        return result(membership.role === 'admin')
      }
    }
    // A public repository's existence/readability alone is not an access grant.
    // Require GitHub's collaborator check AND matching numeric identity/permissions.
    for (let page = 1; page <= 10; page++) {
      const list = await request(`/installation/repositories?per_page=100&page=${page}`, token.token)
      if (!Array.isArray(list.repositories) || !Number.isSafeInteger(list.total_count) || list.repositories.length > 100) throw new SetupError('github_unavailable', 503)
      for (const repo of list.repositories) {
        if (Date.now() >= deadline) throw new SetupError('verification_limit', 503)
        if (!Number.isSafeInteger(repo.id) || !/^[a-zA-Z0-9-]+$/.test(repo.owner?.login ?? '') ||
          !/^[a-zA-Z0-9_.-]+$/.test(repo.name ?? '') || repo.owner?.id !== account.id) throw new SetupError('github_unavailable', 503)
        const path = `/repos/${repo.owner.login}/${repo.name}/collaborators/${user.login}`
        if (await request(path, token.token, undefined, true) !== true) continue
        const permission = await request(`${path}/permission`, token.token, undefined, true)
        if (permission?.user?.id === user.githubUserId && ['read', 'write', 'admin'].includes(permission.permission)) return result(false, repo.id)
      }
      if (page * 100 >= list.total_count || !list.repositories.length) throw new SetupError('access_denied')
    }
    throw new SetupError('verification_limit', 503)
  }
}
