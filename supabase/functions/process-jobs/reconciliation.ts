import type { InstallationSnapshot } from "../_shared/github/reconciliation.ts"
import { normalizeInstallationLifecycle } from "./github-installation.ts"
import { normalizeRepositoryChanges } from "./github-repository.ts"

type ObjectValue = Record<string, unknown>
export interface ReconciliationRepository {
  get(installationId: number): Promise<ObjectValue | null>
  commit(installationId: number, revision: ObjectValue, snapshot: ObjectValue, observedAt: string): Promise<ObjectValue>
}
export function createReconciliationProcessor(repository: ReconciliationRepository,
  getApi: () => { snapshot(id: number): Promise<InstallationSnapshot> }) {
  return async (payload: ObjectValue): Promise<ObjectValue> => {
    const id = payload.github_installation_id
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid reconciliation job")
    const revision = await repository.get(id)
    if (!revision) return { disposition: "stale_or_deleted" }
    const observedAt = new Date().toISOString()
    const snapshot = await getApi().snapshot(id)
    if (!snapshot.installation) return repository.commit(id, revision, { state: "deleted" }, observedAt)
    const raw = snapshot.installation
    const change = normalizeInstallationLifecycle({ id: "api-snapshot", event_name: "installation",
      action: raw.suspended_at ? "suspend" : "unsuspend", github_installation_id: id,
      payload: { installation: raw } })!
    const repos = raw.suspended_at ? [] : normalizeRepositoryChanges({ id: "api-snapshot",
      event_name: "installation", action: "created", github_installation_id: id,
      payload: { installation: raw, repositories: snapshot.repositories } })!.repositories
    return repository.commit(id, revision, { state: raw.suspended_at ? "suspended" : "active",
      account_id: change.accountId, account_login: change.accountLogin, account_type: change.accountType,
      github_updated_at: change.githubUpdatedAt, suspended_at: change.suspendedAt,
      repository_selection: raw.repository_selection, repositories: repos }, observedAt)
  }
}

export function createReconciliationRepository(url: string, key: string, request: typeof fetch = fetch): ReconciliationRepository {
  async function rpc<T>(name: string, body: ObjectValue): Promise<T> {
    const headers: Record<string, string> = { apikey: key, "content-type": "application/json" }
    if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`
    const response = await request(`${url}/rest/v1/rpc/${name}`, {
      method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
    })
    if (!response.ok) throw new Error(`Reconciliation RPC ${name} failed with status ${response.status}`)
    return response.json() as Promise<T>
  }
  return {
    get(id) { return rpc("get_installation_reconciliation_revision", { p_github_installation_id: id }) },
    commit(id, revision, snapshot, observedAt) { return rpc("commit_installation_reconciliation", {
      p_github_installation_id: id, p_revision: revision, p_snapshot: snapshot, p_observed_at: observedAt,
    }) },
  }
}
