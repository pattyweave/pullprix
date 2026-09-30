import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { readGitHubApiEnvironment } from '../_shared/environment.ts'
import { createInstallationVerifier, SetupError } from './github.ts'
import { createInstallationSetupHandler } from './handler.ts'
const variables = Deno.env.toObject(), env = readGitHubApiEnvironment(variables)
if (!variables.APP_URL) throw new Error('APP_URL is required')
async function rpc(name: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { apikey: env.supabaseSecretKey, 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  else if (env.supabaseSecretKey.startsWith('eyJ')) headers.authorization = `Bearer ${env.supabaseSecretKey}`
  const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST', headers,
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error',
  })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new SetupError(token ? 'sign_in_again' : 'access_denied', token ? 401 : 403)
    throw new SetupError('setup_unavailable', 503)
  }
  return response.json()
}
Deno.serve(createInstallationSetupHandler(new URL(variables.APP_URL).origin, {
  subject: token => rpc('get_installation_setup_subject', {}, token),
  verify: createInstallationVerifier(env.githubAppId, env.githubPrivateKey),
  commit: (subject, installationId, accountId, retry, isAdmin, repositoryId) => rpc('complete_team_access', {
    p_user_id: subject.userId, p_session_id: subject.sessionId, p_installation_id: installationId,
    p_account_id: accountId, p_retry: retry, p_is_admin: isAdmin, p_repository_id: repositoryId,
  }),
  revoke: async (subject, installationId) => { await rpc('expire_installation_setup_access', { p_user_id: subject.userId, p_installation_id: installationId }) },
}))
