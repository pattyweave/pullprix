import type { StoredGitHubDelivery } from "./github-installation.ts"

export type GitHubRepositoryChange = {
  eventAt: string
  githubInstallationId: number
  repositories: Array<{
    active: boolean | null
    full_name: string
    github_repository_id: number
    name: string
    owner: string
    private: boolean
  }>
  repositorySelection: "all" | "selected" | null
}

const REPOSITORY_ACTIONS = new Set([
  "created",
  "deleted",
  "renamed",
  "transferred",
])

function object(value: unknown, name: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`GitHub repository payload is missing ${name}`)
  }
  return value as Record<string, unknown>
}

function array(value: unknown, name: string) {
  if (!Array.isArray(value)) {
    throw new Error(`GitHub repository payload is missing ${name}`)
  }
  return value
}

function positiveInteger(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`GitHub repository payload has invalid ${name}`)
  }
  return value
}

function string(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`GitHub repository payload has invalid ${name}`)
  }
  return value
}

function timestamp(value: unknown, name: string) {
  const parsed = string(value, name)
  if (Number.isNaN(Date.parse(parsed))) {
    throw new Error(`GitHub repository payload has invalid ${name}`)
  }
  return parsed
}

function selection(value: unknown) {
  if (value !== "all" && value !== "selected") {
    throw new Error("GitHub repository payload has invalid repository_selection")
  }
  return value
}

function repository(value: unknown, active: boolean | null) {
  const raw = object(value, "repository")
  const fullName = string(raw.full_name, "repository.full_name")
  const ownerValue = raw.owner
  const owner =
    ownerValue && typeof ownerValue === "object" && !Array.isArray(ownerValue)
      ? string((ownerValue as Record<string, unknown>).login, "repository.owner.login")
      : fullName.split("/", 1)[0]

  if (!owner) throw new Error("GitHub repository payload has invalid repository owner")
  if (typeof raw.private !== "boolean") {
    throw new Error("GitHub repository payload has invalid repository.private")
  }

  return {
    active,
    full_name: fullName,
    github_repository_id: positiveInteger(raw.id, "repository.id"),
    name: string(raw.name, "repository.name"),
    owner,
    private: raw.private,
  }
}

export function isRepositoryAccessEvent(delivery: StoredGitHubDelivery) {
  return delivery.event_name === "installation_repositories" ||
    (delivery.event_name === "installation" && delivery.action === "created") ||
    (delivery.event_name === "repository" && Boolean(
      delivery.action && REPOSITORY_ACTIONS.has(delivery.action),
    ))
}

export function normalizeRepositoryChanges(
  delivery: StoredGitHubDelivery,
): GitHubRepositoryChange | null {
  if (!isRepositoryAccessEvent(delivery)) return null

  const installation = object(delivery.payload.installation, "installation")
  const githubInstallationId = positiveInteger(
    installation.id,
    "installation.id",
  )

  if (delivery.event_name === "installation") {
    return {
      eventAt: timestamp(installation.updated_at, "installation.updated_at"),
      githubInstallationId,
      repositories: array(delivery.payload.repositories ?? [], "repositories")
        .map((value) => repository(value, true)),
      repositorySelection: selection(installation.repository_selection),
    }
  }

  if (delivery.event_name === "installation_repositories") {
    return {
      eventAt: timestamp(installation.updated_at, "installation.updated_at"),
      githubInstallationId,
      repositories: [
        ...array(delivery.payload.repositories_added, "repositories_added")
          .map((value) => repository(value, true)),
        ...array(delivery.payload.repositories_removed, "repositories_removed")
          .map((value) => repository(value, false)),
      ],
      repositorySelection: selection(delivery.payload.repository_selection),
    }
  }

  const action = delivery.action
  const active = action === "created"
    ? true
    : action === "deleted" || action === "transferred"
      ? false
      : null
  const rawRepository = object(delivery.payload.repository, "repository")

  return {
    eventAt: timestamp(rawRepository.updated_at, "repository.updated_at"),
    githubInstallationId,
    repositories: [repository(rawRepository, active)],
    repositorySelection: null,
  }
}
