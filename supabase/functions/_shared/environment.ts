type Environment = Record<string, string | undefined>

export type ServerEnvironment = {
  appUrl: string
  githubAppId: string
  githubPrivateKey: string
  githubWebhookSecret: string
  supabaseSecretKey: string
  supabaseUrl: string
}

export class ConfigurationError extends Error {
  readonly variableNames: string[]

  constructor(variableNames: string[]) {
    super(`Missing or invalid server configuration: ${variableNames.join(", ")}`)
    this.name = "ConfigurationError"
    this.variableNames = variableNames
  }
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function normalizePrivateKey(value: string | undefined) {
  return value?.trim().replaceAll("\\n", "\n")
}

function isPrivateKey(value: string | undefined): value is string {
  return Boolean(
    value &&
      /^-----BEGIN (?:RSA )?PRIVATE KEY-----\n[\s\S]+\n-----END (?:RSA )?PRIVATE KEY-----$/.test(
        value,
      ),
  )
}

function readSupabaseSecret(environment: Environment) {
  const directSecret =
    environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY

  if (directSecret?.trim()) return directSecret.trim()

  const secretDictionary = environment.SUPABASE_SECRET_KEYS
  if (!secretDictionary) return undefined

  try {
    const parsed = JSON.parse(secretDictionary) as Record<string, unknown>
    const automationSecret = parsed.automations ?? parsed.default
    return typeof automationSecret === "string" && automationSecret.trim()
      ? automationSecret.trim()
      : undefined
  } catch {
    return undefined
  }
}

export type SupabaseServiceEnvironment = {
  supabaseSecretKey: string
  supabaseUrl: string
}

export type GitHubApiEnvironment = SupabaseServiceEnvironment & {
  githubAppId: string
  githubPrivateKey: string
}

export function readGitHubApiEnvironment(
  environment: Environment,
): GitHubApiEnvironment {
  const invalid: string[] = []
  const githubAppId = environment.GITHUB_APP_ID
  const githubPrivateKey = normalizePrivateKey(
    environment.GITHUB_APP_PRIVATE_KEY,
  )
  const supabaseUrl = environment.SUPABASE_URL
  const supabaseSecretKey = readSupabaseSecret(environment)

  if (!githubAppId || !/^\d+$/.test(githubAppId) || githubAppId === "0") {
    invalid.push("GITHUB_APP_ID")
  }
  if (!isPrivateKey(githubPrivateKey)) invalid.push("GITHUB_APP_PRIVATE_KEY")
  if (!isHttpUrl(supabaseUrl)) invalid.push("SUPABASE_URL")
  if (!supabaseSecretKey) {
    invalid.push(
      "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEYS)",
    )
  }

  if (
    invalid.length > 0 ||
    !githubAppId ||
    !githubPrivateKey ||
    !isHttpUrl(supabaseUrl) ||
    !supabaseSecretKey
  ) {
    throw new ConfigurationError(invalid)
  }

  return {
    githubAppId,
    githubPrivateKey,
    supabaseSecretKey,
    supabaseUrl,
  }
}

export function readGithubWebhookEnvironment(environment: Environment) {
  const githubWebhookSecret = environment.GITHUB_WEBHOOK_SECRET?.trim()

  if (!githubWebhookSecret) {
    throw new ConfigurationError(["GITHUB_WEBHOOK_SECRET"])
  }

  return { githubWebhookSecret }
}

export function readSupabaseServiceEnvironment(
  environment: Environment,
): SupabaseServiceEnvironment {
  const invalid: string[] = []
  const supabaseUrl = environment.SUPABASE_URL
  const supabaseSecretKey = readSupabaseSecret(environment)

  if (!isHttpUrl(supabaseUrl)) invalid.push("SUPABASE_URL")
  if (!supabaseSecretKey) {
    invalid.push(
      "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEYS)",
    )
  }

  if (invalid.length > 0 || !isHttpUrl(supabaseUrl) || !supabaseSecretKey) {
    throw new ConfigurationError(invalid)
  }

  return { supabaseSecretKey, supabaseUrl }
}

/**
 * Validates the complete server-only configuration used by future GitHub Edge
 * Functions. Public functions such as health should validate only what they use.
 */
export function readServerEnvironment(
  environment: Environment,
): ServerEnvironment {
  const invalid: string[] = []
  const appUrl = environment.APP_URL
  const githubAppId = environment.GITHUB_APP_ID
  const githubPrivateKey = normalizePrivateKey(
    environment.GITHUB_APP_PRIVATE_KEY,
  )
  const githubWebhookSecret = environment.GITHUB_WEBHOOK_SECRET?.trim()
  const supabaseUrl = environment.SUPABASE_URL
  const supabaseSecretKey = readSupabaseSecret(environment)

  if (!isHttpUrl(appUrl)) invalid.push("APP_URL")
  if (!githubAppId || !/^\d+$/.test(githubAppId) || githubAppId === "0") {
    invalid.push("GITHUB_APP_ID")
  }
  if (!isPrivateKey(githubPrivateKey)) invalid.push("GITHUB_APP_PRIVATE_KEY")
  if (!githubWebhookSecret) invalid.push("GITHUB_WEBHOOK_SECRET")
  if (!isHttpUrl(supabaseUrl)) invalid.push("SUPABASE_URL")
  if (!supabaseSecretKey) {
    invalid.push(
      "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEYS)",
    )
  }

  if (invalid.length > 0) throw new ConfigurationError(invalid)

  return {
    appUrl,
    githubAppId,
    githubPrivateKey,
    githubWebhookSecret,
    supabaseSecretKey,
    supabaseUrl,
  }
}
