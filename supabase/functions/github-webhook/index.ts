import { readGithubWebhookEnvironment } from "../_shared/environment.ts"
import { handleGitHubWebhookRequest } from "./handler.ts"

const environment = readGithubWebhookEnvironment(Deno.env.toObject())

Deno.serve((request) =>
  handleGitHubWebhookRequest(request, {
    webhookSecret: environment.githubWebhookSecret,
  }),
)
