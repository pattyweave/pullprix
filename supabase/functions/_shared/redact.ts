const SENSITIVE_KEY =
  /(?:authorization|cookie|credential|private.?key|password|secret|service.?role|token)/i

const SENSITIVE_TEXT_PATTERNS = [
  /\bBearer\s+[^\s,;]+/gi,
  /\bgh[pousr]_[A-Za-z0-9_]+\b/g,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
]

const REDACTED = "[REDACTED]"

export function redactText(value: string) {
  return SENSITIVE_TEXT_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, REDACTED),
    value,
  )
}

/** Creates a safe copy suitable for structured Edge Function logs. */
export function redactForLog(value: unknown): unknown {
  if (typeof value === "string") return redactText(value)
  if (Array.isArray(value)) return value.map(redactForLog)
  if (!value || typeof value !== "object") return value

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactForLog(nestedValue),
    ]),
  )
}
