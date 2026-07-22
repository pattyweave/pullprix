import { readSupabaseServiceEnvironment } from "../_shared/environment.ts"
import { handleProcessJobsRequest } from "./handler.ts"
import { createGitHubInstallationProcessor } from "./github-installation.ts"
import { createGitHubInstallationRepository } from "./github-installation-repository.ts"
import { createBackgroundJobRepository } from "./repository.ts"

const environment = readSupabaseServiceEnvironment(Deno.env.toObject())
const repository = createBackgroundJobRepository(
  environment.supabaseUrl,
  environment.supabaseSecretKey,
)
const githubInstallationRepository = createGitHubInstallationRepository(
  environment.supabaseUrl,
  environment.supabaseSecretKey,
)
const processGitHubDelivery = createGitHubInstallationProcessor(
  githubInstallationRepository,
)

Deno.serve((request) =>
  handleProcessJobsRequest(request, {
    processGitHubDelivery,
    repository,
    secretKey: environment.supabaseSecretKey,
  }),
)
