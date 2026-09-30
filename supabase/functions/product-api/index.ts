import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { readSupabaseServiceEnvironment } from '../_shared/environment.ts'
import { createProductHandler } from './handler.ts'
import { createProductLoader, createHistoryLoader } from './repository.ts'
const variables = Deno.env.toObject(), env = readSupabaseServiceEnvironment(variables)
if (!variables.APP_URL) throw new Error('APP_URL is required')
Deno.serve(createProductHandler(new URL(variables.APP_URL).origin, {
  load: createProductLoader(env.supabaseUrl, env.supabaseSecretKey),
  history: createHistoryLoader(env.supabaseUrl, env.supabaseSecretKey),
}))
