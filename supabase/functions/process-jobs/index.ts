import { createSeasonFinalizer, createSeasonFinalizationRepository } from './season-finalization.ts'
import { readGitHubApiEnvironment, readSupabaseServiceEnvironment } from "../_shared/environment.ts"
import { handleProcessJobsRequest } from "./handler.ts"
import { createGitHubInstallationProcessor } from "./github-installation.ts"
import { createGitHubInstallationRepository } from "./github-installation-repository.ts"
import { createBackgroundJobRepository } from "./repository.ts"
import { createBackfillProcessor, createBackfillRepository } from "./backfill.ts"
import { createServerGitHubApiClient } from "../_shared/github/server.ts"
import { createGitHubReconciliationClient } from "../_shared/github/reconciliation.ts"
import { createReconciliationProcessor, createReconciliationRepository } from "./reconciliation.ts"
import { createScoringProcessor, createScoringRepository } from "./scoring.ts"

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
// Lazy initialization keeps webhook ingestion operational if API credentials
// have not yet been configured. Only a backfill job requires the private key.
let githubApi: ReturnType<typeof createServerGitHubApiClient> | undefined
const scoringRepository = createScoringRepository(environment.supabaseUrl, environment.supabaseSecretKey)
const processScoring = createScoringProcessor(scoringRepository,
  () => githubApi ??= createServerGitHubApiClient(Deno.env.toObject()))
const processBackfill = createBackfillProcessor(
  createBackfillRepository(environment.supabaseUrl, environment.supabaseSecretKey),
  () => githubApi ??= createServerGitHubApiClient(Deno.env.toObject()),
)
let reconciliationApi: ReturnType<typeof createGitHubReconciliationClient> | undefined
const processReconciliation = createReconciliationProcessor(
  createReconciliationRepository(environment.supabaseUrl, environment.supabaseSecretKey),
  () => {
    if (!reconciliationApi) {
      const credentials = readGitHubApiEnvironment(Deno.env.toObject())
      reconciliationApi = createGitHubReconciliationClient(credentials.githubAppId, credentials.githubPrivateKey)
    }
    return reconciliationApi
  },
)

Deno.serve((request) =>
  handleProcessJobsRequest(request, {
    processGitHubDelivery,
    processBackfill,
    processReconciliation,
    processScoring,
    enqueueScoring: scoringRepository.enqueue,
    finalizeSeasons: createSeasonFinalizer(createSeasonFinalizationRepository(environment.supabaseUrl, environment.supabaseSecretKey)),
    deleteUninstalledData: repository.deleteUninstalledData,
    repository,
    secretKey: environment.supabaseSecretKey,
  }),
)
