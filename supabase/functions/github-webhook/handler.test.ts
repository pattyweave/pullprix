import { describe, expect, it } from "vitest"

import { handleGitHubWebhookRequest } from "./handler.ts"

const secret = "fixture-webhook-secret"
const deliveryId = "72d3162e-cc78-11e3-81ab-4c9367dc0958"

async function signatureFor(body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  )
  const hex = [...signature]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

  return `sha256=${hex}`
}

async function requestFor(
  body: string,
  overrides: Record<string, string | undefined> = {},
) {
  const headers = new Headers({
    "content-type": "application/json",
    "x-github-delivery": deliveryId,
    "x-github-event": "pull_request_review",
    "x-hub-signature-256": await signatureFor(body),
  })

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) headers.delete(name)
    else headers.set(name, value)
  }

  return new Request("http://localhost/functions/v1/github-webhook", {
    method: "POST",
    headers,
    body,
  })
}

describe("GitHub webhook signature verification", () => {
  it("accepts a valid signature over the untouched request bytes", async () => {
    const body = '{"action":"submitted","reviewer":"Renée"}'
    const response = await handleGitHubWebhookRequest(await requestFor(body), {
      webhookSecret: secret,
    })

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      delivery_id: deliveryId,
      event: "pull_request_review",
    })
  })

  it("rejects a payload changed after signing", async () => {
    const originalBody = '{"action":"submitted"}'
    const request = await requestFor('{"action": "submitted"}', {
      "x-hub-signature-256": await signatureFor(originalBody),
    })
    const response = await handleGitHubWebhookRequest(request, {
      webhookSecret: secret,
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: "invalid_signature",
    })
  })

  it.each([undefined, "", "sha1=abc", "sha256=not-hex", "sha256=1234"])(
    "rejects a missing or malformed signature: %s",
    async (signature) => {
      const response = await handleGitHubWebhookRequest(
        await requestFor("{}", { "x-hub-signature-256": signature }),
        { webhookSecret: secret },
      )

      expect(response.status).toBe(401)
    },
  )

  it("validates GitHub delivery metadata only after signature verification", async () => {
    const response = await handleGitHubWebhookRequest(
      await requestFor("{}", { "x-github-delivery": undefined }),
      { webhookSecret: secret },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "invalid_github_headers",
    })
  })

  it("does not parse or trust JSON before accepting signed raw bytes", async () => {
    const response = await handleGitHubWebhookRequest(
      await requestFor("this is intentionally not JSON"),
      { webhookSecret: secret },
    )

    expect(response.status).toBe(202)
  })
})
