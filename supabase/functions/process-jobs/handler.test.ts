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

const processGitHubDelivery = vi.fn().mockResolvedValue({ disposition: "applied" })

describe("process-jobs Edge Function", () => {
  it("rejects requests without the server secret", async () => {
    const repository = createRepository([])
    const response = await handleProcessJobsRequest(request("wrong-key"), {
      processGitHubDelivery,
      repository,
      secretKey: "server-secret",
    })

    expect(response.status).toBe(401)
    expect(repository.claim).not.toHaveBeenCalled()
  })

  it("claims a bounded batch and completes a supported job", async () => {
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined)
    const repository = createRepository([job])
    const response = await handleProcessJobsRequest(request(), {
      processGitHubDelivery,
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
    expect(infoLog).toHaveBeenCalledWith(
      JSON.stringify({
        event: "background_job_succeeded",
        attempt: 1,
        job_id: "job-1",
        job_type: "system.noop",
      }),
    )
    infoLog.mockRestore()
  })

  it("returns unsupported work to the database retry policy", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const unsupportedJob = { ...job, job_type: "backfill.repository-page" }
    const repository = createRepository([unsupportedJob])
    const response = await handleProcessJobsRequest(request(), {
      processGitHubDelivery,
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
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({
        event: "background_job_failed",
        attempt: 1,
        job_id: "job-1",
        job_type: "backfill.repository-page",
      }),
    )
    expect(errorLog.mock.calls.flat().join(" ")).not.toContain("payload")
    errorLog.mockRestore()
  })

  it("logs a safe batch failure without the exception or secret", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const repository = createRepository([])
    repository.claim.mockRejectedValue(
      new Error("database rejected server-secret and private payload"),
    )

    const response = await handleProcessJobsRequest(request(), {
      processGitHubDelivery,
      repository,
      secretKey: "server-secret",
    })

    expect(response.status).toBe(500)
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({ event: "background_job_batch_failed" }),
    )
    expect(errorLog.mock.calls.flat().join(" ")).not.toContain("server-secret")
    expect(errorLog.mock.calls.flat().join(" ")).not.toContain("private payload")
    errorLog.mockRestore()
  })

  it("routes a GitHub delivery job to its lifecycle processor", async () => {
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined)
    const repository = createRepository([{
      ...job,
      job_type: "github.delivery",
      payload: { delivery_id: "delivery-1" },
    }])
    const lifecycleProcessor = vi.fn().mockResolvedValue({
      disposition: "applied",
      installation_status: "active",
    })

    const response = await handleProcessJobsRequest(request(), {
      processGitHubDelivery: lifecycleProcessor,
      repository,
      secretKey: "server-secret",
    })

    expect(lifecycleProcessor).toHaveBeenCalledWith("delivery-1")
    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({ job_type: "github.delivery" }),
      { disposition: "applied", installation_status: "active" },
    )
    await expect(response.json()).resolves.toMatchObject({ succeeded: 1 })
    infoLog.mockRestore()
  })
})
