import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { readGitHubApiEnvironment } from '../_shared/environment.ts'
import { createProductHandler } from './handler.ts'
import { createProductLoader, createHistoryLoader } from './repository.ts'
import { createReviewQueueLoader } from './review-queue.ts'
import { createGitHubInstallationTokenProvider } from '../_shared/github/token-provider.ts'
const variables = Deno.env.toObject(), env = readGitHubApiEnvironment(variables)
if (!variables.APP_URL) throw new Error('APP_URL is required')
Deno.serve(createProductHandler(new URL(variables.APP_URL).origin, {
  queue: createReviewQueueLoader(env.supabaseUrl, env.supabaseSecretKey, createGitHubInstallationTokenProvider(env.githubAppId, env.githubPrivateKey)),
  load: createProductLoader(env.supabaseUrl, env.supabaseSecretKey),
  history: createHistoryLoader(env.supabaseUrl, env.supabaseSecretKey),
}))
