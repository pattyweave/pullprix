export type BackgroundJob = {
  attempt_count: number
  job_id: string
  job_type: string
  max_attempts: number
  payload: Record<string, unknown>
  queue_message_id: number
}

export type FailureDisposition = "failed" | "ignored" | "retrying"

export interface BackgroundJobRepository {
  claim(batchSize: number, visibilityTimeoutSeconds: number): Promise<BackgroundJob[]>
  complete(job: BackgroundJob, result: Record<string, unknown>): Promise<boolean>
  fail(job: BackgroundJob, error: string, retryDelaySeconds?: number): Promise<FailureDisposition>
}

type Fetch = typeof fetch

export function createBackgroundJobRepository(
  supabaseUrl: string,
  secretKey: string,
  fetchImplementation: Fetch = fetch,
): BackgroundJobRepository & { deleteUninstalledData(): Promise<number> } {
  async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = {
      apikey: secretKey,
      "content-type": "application/json",
    }

    // Local Supabase still injects a legacy service-role JWT. New sb_secret_
    // keys belong only in apikey; legacy JWT keys also identify the PostgREST
    // role through Authorization.
    if (secretKey.startsWith("eyJ")) {
      headers.authorization = `Bearer ${secretKey}`
    }

    const response = await fetchImplementation(
      `${supabaseUrl}/rest/v1/rpc/${name}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
    )

    if (!response.ok) {
      throw new Error(`Database RPC ${name} failed with status ${response.status}`)
    }

    return (await response.json()) as T
  }

  return {
    deleteUninstalledData: () => rpc<number>('process_data_deletions', {}),
    claim(batchSize, visibilityTimeoutSeconds) {
      return rpc<BackgroundJob[]>("claim_background_jobs", {
        p_batch_size: batchSize,
        p_visibility_timeout_seconds: visibilityTimeoutSeconds,
      })
    },
    complete(job, result) {
      return rpc<boolean>("complete_background_job", {
        p_job_id: job.job_id,
        p_queue_message_id: job.queue_message_id,
        p_result: result,
      })
    },
    fail(job, error, retryDelaySeconds) {
      return rpc<FailureDisposition>("fail_background_job", {
        p_error: error,
        p_job_id: job.job_id,
        p_queue_message_id: job.queue_message_id,
        ...(retryDelaySeconds === undefined ? {} : { p_retry_delay_seconds: retryDelaySeconds }),
      })
    },
  }
}
