export type StoredGitHubDelivery = {
  action: string | null
  event_name: string
  github_installation_id: number | null
  id: string
  payload: Record<string, unknown>
}

export type InstallationLifecycleChange = {
  accountId: number
  accountLogin: string
  accountType: "Organization" | "User"
  action:
    | "created"
    | "deleted"
    | "new_permissions_accepted"
    | "renamed"
    | "suspend"
    | "unsuspend"
  githubInstallationId: number
  githubUpdatedAt: string
  installedAt: string
  suspendedAt: string | null
}

export type InstallationLifecycleResult = {
  disposition: "applied" | "stale"
  installation_id: string
  installation_status: "active" | "deleted" | "suspended"
  organization_id: string
}

export interface GitHubInstallationRepository {
  apply(change: InstallationLifecycleChange): Promise<InstallationLifecycleResult>
  getDelivery(deliveryId: string): Promise<StoredGitHubDelivery>
  isActive(githubInstallationId: number): Promise<boolean>
}

const INSTALLATION_ACTIONS = new Set([
  "created",
  "deleted",
  "new_permissions_accepted",
  "suspend",
  "unsuspend",
])

function object(value: unknown, name: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`GitHub lifecycle payload is missing ${name}`)
  }
  return value as Record<string, unknown>
}

function positiveInteger(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`GitHub lifecycle payload has invalid ${name}`)
  }
  return value
}

function string(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`GitHub lifecycle payload has invalid ${name}`)
  }
  return value
}

function timestamp(value: unknown, name: string) {
  const parsed = string(value, name)
  if (Number.isNaN(Date.parse(parsed))) {
    throw new Error(`GitHub lifecycle payload has invalid ${name}`)
  }
  return parsed
}

export function normalizeInstallationLifecycle(
  delivery: StoredGitHubDelivery,
): InstallationLifecycleChange | null {
  if (delivery.event_name === "ping") return null

  const installation = object(delivery.payload.installation, "installation")
  const action = delivery.action
  let accountValue = installation.account

  if (delivery.event_name === "installation_target") {
    if (action !== "renamed") {
      throw new Error(`Unsupported installation_target action ${action ?? "missing"}`)
    }
    accountValue = delivery.payload.account
  } else if (
    delivery.event_name !== "installation" ||
    !action ||
    !INSTALLATION_ACTIONS.has(action)
  ) {
    throw new Error(
      `No installation lifecycle processor for ${delivery.event_name}.${action ?? "missing"}`,
    )
  }

  const account = object(accountValue, "account")
  const accountType = string(account.type, "account.type")
  if (accountType !== "Organization" && accountType !== "User") {
    throw new Error("GitHub lifecycle payload has invalid account.type")
  }

  return {
    accountId: positiveInteger(account.id, "account.id"),
    accountLogin: string(account.login, "account.login"),
    accountType,
    action: action as InstallationLifecycleChange["action"],
    githubInstallationId: positiveInteger(installation.id, "installation.id"),
    githubUpdatedAt: timestamp(installation.updated_at, "installation.updated_at"),
    installedAt: timestamp(installation.created_at, "installation.created_at"),
    suspendedAt:
      installation.suspended_at === null || installation.suspended_at === undefined
        ? null
        : timestamp(installation.suspended_at, "installation.suspended_at"),
  }
}

export function createGitHubInstallationProcessor(
  repository: GitHubInstallationRepository,
) {
  return async (deliveryId: string) => {
    const delivery = await repository.getDelivery(deliveryId)
    const isLifecycleEvent =
      delivery.event_name === "installation" ||
      delivery.event_name === "installation_target"
    let change: InstallationLifecycleChange | null
    try {
      change = normalizeInstallationLifecycle(delivery)
    } catch (error) {
      if (
        !isLifecycleEvent &&
        delivery.github_installation_id &&
        !(await repository.isActive(delivery.github_installation_id))
      ) {
        return { disposition: "ignored", reason: "installation_inactive" }
      }
      throw error
    }
    if (!change) return { disposition: "ignored", event: delivery.event_name }

    const result = await repository.apply(change)
    return {
      disposition: result.disposition,
      installation_id: result.installation_id,
      installation_status: result.installation_status,
      organization_id: result.organization_id,
    }
  }
}
