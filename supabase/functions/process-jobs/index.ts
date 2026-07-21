import { readSupabaseServiceEnvironment } from "../_shared/environment.ts"
import { handleProcessJobsRequest } from "./handler.ts"
import { createBackgroundJobRepository } from "./repository.ts"

const environment = readSupabaseServiceEnvironment(Deno.env.toObject())
const repository = createBackgroundJobRepository(
  environment.supabaseUrl,
  environment.supabaseSecretKey,
)

Deno.serve((request) =>
  handleProcessJobsRequest(request, {
    repository,
    secretKey: environment.supabaseSecretKey,
  }),
)
