import { describe, expect, it } from "vitest"

import { redactForLog, redactText } from "./redact.ts"

describe("log redaction", () => {
  it("redacts sensitive fields recursively", () => {
    expect(
      redactForLog({
        authorization: "Bearer auth-value",
        installation: {
          id: 42,
          privateKey: "key-value",
          webhook_secret: "secret-value",
        },
        tokens: [{ accessToken: "token-value", expiresAt: "tomorrow" }],
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      installation: {
        id: 42,
        privateKey: "[REDACTED]",
        webhook_secret: "[REDACTED]",
      },
      tokens: "[REDACTED]",
    })
  })

  it("redacts common credentials embedded in text", () => {
    const message =
      "Authorization: Bearer abc.123; token ghp_abcdefghijklmnop and eyJabc.def.ghi"

    expect(redactText(message)).toBe(
      "Authorization: [REDACTED]; token [REDACTED] and [REDACTED]",
    )
  })
})
