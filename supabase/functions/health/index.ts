import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { handleHealthRequest } from "./handler.ts"

Deno.serve(handleHealthRequest)
