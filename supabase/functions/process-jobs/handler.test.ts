import { describe, expect, it, vi } from "vitest"

import { handleProcessJobsRequest } from "./handler.ts"
import type {
  BackgroundJob,
  BackgroundJobRepository,
} from "./repository.ts"

const job: BackgroundJob = {
  attempt_count: 1,
  job_id: "job-1",
  job_type: "system.noop",
  max_attempts: 3,
  payload: {},
  queue_message_id: 42,
}

function createRepository(
  jobs: BackgroundJob[],
): BackgroundJobRepository & {
  claim: ReturnType<typeof vi.fn>
  complete: ReturnType<typeof vi.fn>
  fail: ReturnType<typeof vi.fn>
} {
  return {
    claim: vi.fn().mockResolvedValue(jobs),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue("retrying"),
  }
}

function request(apiKey = "server-secret") {
  return new Request("http://localhost/functions/v1/process-jobs", {
    method: "POST",
    headers: { apikey: apiKey },
  })
}

describe("process-jobs Edge Function", () => {
  it("rejects requests without the server secret", async () => {
    const repository = createRepository([])
    const response = await handleProcessJobsRequest(request("wrong-key"), {
      repository,
      secretKey: "server-secret",
    })

    expect(response.status).toBe(401)
    expect(repository.claim).not.toHaveBeenCalled()
  })

  it("claims a bounded batch and completes a supported job", async () => {
    const repository = createRepository([job])
    const response = await handleProcessJobsRequest(request(), {
      repository,
      secretKey: "server-secret",
    })

    expect(repository.claim).toHaveBeenCalledWith(5, 60)
    expect(repository.complete).toHaveBeenCalledWith(job, { processed: true })
    expect(repository.fail).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      claimed: 1,
      failed: 0,
      succeeded: 1,
    })
  })

  it("returns unsupported work to the database retry policy", async () => {
    const unsupportedJob = { ...job, job_type: "backfill.repository-page" }
    const repository = createRepository([unsupportedJob])
    const response = await handleProcessJobsRequest(request(), {
      repository,
      secretKey: "server-secret",
    })

    expect(repository.complete).not.toHaveBeenCalled()
    expect(repository.fail).toHaveBeenCalledWith(
      unsupportedJob,
      "No processor registered for job type backfill.repository-page",
    )
    await expect(response.json()).resolves.toEqual({
      claimed: 1,
      failed: 1,
      succeeded: 0,
    })
  })
})
