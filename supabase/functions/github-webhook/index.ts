import {
  readGithubWebhookEnvironment,
  readSupabaseServiceEnvironment,
} from "../_shared/environment.ts"
import { handleGitHubWebhookRequest } from "./handler.ts"
import { createGitHubDeliveryRepository } from "./repository.ts"

const variables = Deno.env.toObject()
const webhookEnvironment = readGithubWebhookEnvironment(variables)
const supabaseEnvironment = readSupabaseServiceEnvironment(variables)
const repository = createGitHubDeliveryRepository(
  supabaseEnvironment.supabaseUrl,
  supabaseEnvironment.supabaseSecretKey,
)

Deno.serve((request) =>
  handleGitHubWebhookRequest(request, {
    repository,
    webhookSecret: webhookEnvironment.githubWebhookSecret,
  }),
)
