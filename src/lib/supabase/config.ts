export type BrowserSupabaseConfig = {
  publishableKey: string
  url: string
}

type BrowserEnvironment = Record<string, string | undefined>

export class BrowserConfigurationError extends Error {
  constructor(variableNames: string[]) {
    super(`Missing or invalid public configuration: ${variableNames.join(", ")}`)
    this.name = "BrowserConfigurationError"
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

/**
 * Reads only values that are intentionally safe for Vite's browser bundle.
 * Call this when the real Supabase client is created; the mock demo does not
 * require environment configuration.
 */
export function readBrowserSupabaseConfig(
  environment: BrowserEnvironment = import.meta.env,
): BrowserSupabaseConfig {
  const invalid: string[] = []
  const url = environment.VITE_SUPABASE_URL
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY

  if (!isHttpUrl(url)) invalid.push("VITE_SUPABASE_URL")
  if (!publishableKey?.trim()) {
    invalid.push("VITE_SUPABASE_PUBLISHABLE_KEY")
  }

  if (
    invalid.length > 0 ||
    !isHttpUrl(url) ||
    !publishableKey?.trim()
  ) {
    throw new BrowserConfigurationError(invalid)
  }

  return {
    publishableKey: publishableKey.trim(),
    url,
  }
}
