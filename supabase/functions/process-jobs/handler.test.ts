import { describe, expect, it, vi } from "vitest"

import { handleProcessJobsRequest } from "./handler.ts"
import { GitHubRateLimitError, readGitHubRateLimit } from "../_shared/github/rate-limit.ts"
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
    claim: vi.fn().mockResolvedValueOnce(jobs).mockResolvedValue([]),
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
  it("schedules dirty scores and routes scoring through the existing worker", async () => {
    const scoring = { ...job, job_type: "scoring.pull-request", payload: { pull_request_id: "pr" } }
    const repository = createRepository([scoring])
    const enqueueScoring = vi.fn().mockResolvedValue(1), processScoring = vi.fn().mockResolvedValue({ disposition: "pending" })
    const response = await handleProcessJobsRequest(request(), { repository, processGitHubDelivery, enqueueScoring, processScoring, secretKey: "server-secret" })
    expect(processScoring).toHaveBeenCalledWith(scoring.payload)
    expect(enqueueScoring).toHaveBeenCalledTimes(2)
    expect(repository.complete).toHaveBeenCalledWith(scoring, { disposition: "pending" })
    await expect(response.json()).resolves.toMatchObject({ claimed: 1, succeeded: 1, failed: 0 })
  })
  it("routes reconciliation through the same isolated job failure handling", async () => {
    const reconcile = { ...job, job_type: "github.reconcile-installation", payload: { github_installation_id: 123 } }
    const repository = createRepository([reconcile])
    repository.claim.mockResolvedValueOnce([job])
    const processReconciliation = vi.fn().mockRejectedValue(new Error("GitHub installation snapshot failed with status 503"))
    const response = await handleProcessJobsRequest(request(), { repository, processGitHubDelivery,
      processReconciliation, secretKey: "server-secret" })
    expect(processReconciliation).toHaveBeenCalledWith(reconcile.payload)
    await expect(response.json()).resolves.toEqual({ claimed: 2, failed: 1, succeeded: 1 })
  })
  it("drains follow-up pages while isolating rate-limited repositories", async () => {
    const backfillJob = { ...job, job_type: "backfill.repository-page", payload: { repository_id: "repo" } }
    const repository = createRepository([backfillJob])
    repository.claim.mockResolvedValueOnce([job])
    const processBackfill = vi.fn().mockRejectedValue(new GitHubRateLimitError(
      readGitHubRateLimit(new Headers({ "retry-after": "120" })),
    ))
    const response = await handleProcessJobsRequest(request(), {
      processGitHubDelivery, processBackfill, repository, secretKey: "server-secret",
    })
    expect(processBackfill).toHaveBeenCalledWith(backfillJob.payload)
    expect(repository.fail).toHaveBeenCalledWith(backfillJob, "GitHub API rate limit exceeded", 120)
    expect(repository.complete).toHaveBeenCalledWith(job, { processed: true })
    await expect(response.json()).resolves.toEqual({ claimed: 2, failed: 1, succeeded: 1 })
  })

  it("stops draining after ten jobs", async () => {
    const repository = createRepository([job])
    repository.claim.mockResolvedValue([job])
    const response = await handleProcessJobsRequest(request(), { processGitHubDelivery, repository, secretKey: "server-secret" })
    await expect(response.json()).resolves.toMatchObject({ claimed: 10 })
    expect(repository.claim).toHaveBeenCalledTimes(10)
  })
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

    expect(repository.claim).toHaveBeenCalledWith(1, 120)
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
    repository.claim.mockReset().mockRejectedValue(
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

it('runs finalization on idle ticks, isolates failure, and requires worker authorization', async () => {
  const finalizeSeasons=vi.fn().mockRejectedValue(new Error('retry later'))
  const dependencies={repository:createRepository([]),processGitHubDelivery,finalizeSeasons,secretKey:'server-secret',log:vi.fn()}
  expect((await handleProcessJobsRequest(request('wrong'),dependencies)).status).toBe(401)
  expect(finalizeSeasons).not.toHaveBeenCalled()
  expect((await handleProcessJobsRequest(request(),dependencies)).status).toBe(200)
  expect(finalizeSeasons).toHaveBeenCalledTimes(1)
})

it('runs deletion maintenance after authorized work and isolates purge failures', async () => {
  const deleteUninstalledData=vi.fn().mockRejectedValue(new Error('retry later'))
  const deps={repository:createRepository([job]),processGitHubDelivery,deleteUninstalledData,secretKey:'server-secret'}
  expect((await handleProcessJobsRequest(request('wrong'),deps)).status).toBe(401)
  expect(deleteUninstalledData).not.toHaveBeenCalled()
  const response=await handleProcessJobsRequest(request(),deps)
  expect(await response.json()).toMatchObject({succeeded:1})
  expect(deleteUninstalledData).toHaveBeenCalledTimes(1)
})
