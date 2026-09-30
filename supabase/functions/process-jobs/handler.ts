import type {
  BackgroundJob,
  BackgroundJobRepository,
} from "./repository.ts"
import { redactForLog } from "../_shared/redact.ts"
import { GitHubRateLimitError } from "../_shared/github/rate-limit.ts"

type ProcessJobsDependencies = {
  processGitHubDelivery: (deliveryId: string) => Promise<Record<string, unknown>>
  processBackfill?: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>
  processReconciliation?: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>
  processScoring?: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>
  enqueueScoring?: () => Promise<number>
  deleteUninstalledData?: () => Promise<number>
  finalizeSeasons?: () => Promise<number>
  repository: BackgroundJobRepository
  secretKey: string
}

function constantTimeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length)
  let difference = left.length ^ right.length

  for (let index = 0; index < maxLength; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }

  return difference === 0
}

async function processJob(
  job: BackgroundJob,
  dependencies: ProcessJobsDependencies,
) {
  if (job.job_type === "system.noop") {
    return { processed: true }
  }

  if (job.job_type === "github.delivery") {
    const deliveryId = job.payload.delivery_id
    if (typeof deliveryId !== "string" || !deliveryId) {
      throw new Error("GitHub delivery job is missing delivery_id")
    }
    return dependencies.processGitHubDelivery(deliveryId)
  }

  if (job.job_type === "backfill.repository-page" && dependencies.processBackfill) {
    return dependencies.processBackfill(job.payload)
  }
  if (job.job_type === "github.reconcile-installation" && dependencies.processReconciliation) {
    return dependencies.processReconciliation(job.payload)
  }
  if (job.job_type === "scoring.pull-request" && dependencies.processScoring) {
    return dependencies.processScoring(job.payload)
  }

  throw new Error(`No processor registered for job type ${job.job_type}`)
}

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  })
}

function log(
  level: "error" | "info",
  event: string,
  job?: BackgroundJob,
) {
  const entry = redactForLog({
    event,
    ...(job && {
      attempt: job.attempt_count,
      job_id: job.job_id,
      job_type: job.job_type,
    }),
  })

  console[level](JSON.stringify(entry))
}

export async function handleProcessJobsRequest(
  request: Request,
  dependencies: ProcessJobsDependencies,
) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: {
        allow: "POST",
        "cache-control": "no-store",
        "content-type": "application/json",
      },
    })
  }

  const apiKey = request.headers.get("apikey") ?? ""
  if (!constantTimeEqual(apiKey, dependencies.secretKey)) {
    return json({ error: "unauthorized" }, 401)
  }

  try {
    const deadline = Date.now() + 40_000
    let claimed = 0
    let succeeded = 0
    let failed = 0

    // Claim just before processing; later pages need not wait for another cron.
    while (claimed < 10 && Date.now() < deadline) {
      await dependencies.enqueueScoring?.()
      const jobs = await dependencies.repository.claim(1, 120)
      if (!jobs.length) break
      const job = jobs[0]
      claimed += 1
      try {
        const result = await processJob(job, dependencies)
        if (await dependencies.repository.complete(job, result)) {
          succeeded += 1
          log("info", "background_job_succeeded", job)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown job error"
        if (error instanceof GitHubRateLimitError) {
          const limit = error.rateLimit
          const resetDelay = limit.remaining === 0 && limit.resetAt
            ? Math.ceil((Date.parse(limit.resetAt) - Date.now()) / 1000) : 60
          const delay = Math.min(3600, Math.max(1, limit.retryAfterSeconds ?? resetDelay))
          await dependencies.repository.fail(job, message, delay)
        } else {
          await dependencies.repository.fail(job, message)
        }
        failed += 1
        log("error", "background_job_failed", job)
      }
    }

    if (dependencies.deleteUninstalledData) {
      try { await dependencies.deleteUninstalledData() }
      catch { log("error", "data_deletion_failed") }
    }
    // Independent maintenance: errors retry on the next existing minute tick and
    // cannot undo ingestion or delay calendar-based next-season activation.
    if (dependencies.finalizeSeasons) {
      try { await dependencies.finalizeSeasons() }
      catch { log("error", "season_finalization_failed") }
    }
    return json({ claimed, failed, succeeded }, 200)
  } catch {
    log("error", "background_job_batch_failed")
    return json({ error: "job_batch_failed" }, 500)
  }
}
