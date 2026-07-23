export type GitHubRateLimit = {
  limit: number | null
  remaining: number | null
  resetAt: string | null
  resource: string | null
  retryAfterSeconds: number | null
  used: number | null
}

function integer(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function readGitHubRateLimit(headers: Headers): GitHubRateLimit {
  const reset = integer(headers.get("x-ratelimit-reset"))
  return {
    limit: integer(headers.get("x-ratelimit-limit")),
    remaining: integer(headers.get("x-ratelimit-remaining")),
    resetAt: reset === null ? null : new Date(reset * 1000).toISOString(),
    resource: headers.get("x-ratelimit-resource"),
    retryAfterSeconds: integer(headers.get("retry-after")),
    used: integer(headers.get("x-ratelimit-used")),
  }
}

export class GitHubRateLimitError extends Error {
  readonly rateLimit: GitHubRateLimit

  constructor(rateLimit: GitHubRateLimit) {
    super("GitHub API rate limit exceeded")
    this.name = "GitHubRateLimitError"
    this.rateLimit = rateLimit
  }
}
