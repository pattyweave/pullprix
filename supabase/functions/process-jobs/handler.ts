import type {
  BackgroundJob,
  BackgroundJobRepository,
} from "./repository.ts"

type ProcessJobsDependencies = {
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

async function processJob(job: BackgroundJob) {
  if (job.job_type === "system.noop") {
    return { processed: true }
  }

  throw new Error(`No processor registered for job type ${job.job_type}`)
}

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  })
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
    const jobs = await dependencies.repository.claim(5, 60)
    let succeeded = 0
    let failed = 0

    for (const job of jobs) {
      try {
        const result = await processJob(job)
        if (await dependencies.repository.complete(job, result)) succeeded += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown job error"
        await dependencies.repository.fail(job, message)
        failed += 1
      }
    }

    return json({ claimed: jobs.length, failed, succeeded }, 200)
  } catch {
    return json({ error: "job_batch_failed" }, 500)
  }
}
