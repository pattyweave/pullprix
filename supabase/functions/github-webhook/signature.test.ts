import { describe, expect, it } from "vitest"

import { verifyGitHubWebhookSignature } from "./signature.ts"

describe("GitHub HMAC verifier", () => {
  it("matches GitHub's published SHA-256 test vector", async () => {
    await expect(
      verifyGitHubWebhookSignature(
        new TextEncoder().encode("Hello, World!"),
        "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
        "It's a Secret to Everybody",
      ),
    ).resolves.toBe(true)
  })
})
