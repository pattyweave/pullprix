import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { readSupabaseServiceEnvironment } from "../_shared/environment.ts"
import { createAuthSessionHandler } from "./handler.ts"
const env = Deno.env.toObject()
const service = readSupabaseServiceEnvironment(env)
if (!env.APP_URL) throw new Error('APP_URL is required')
Deno.serve(createAuthSessionHandler({ supabaseUrl: service.supabaseUrl, apiKey: service.supabaseSecretKey, appOrigin: new URL(env.APP_URL).origin }))
