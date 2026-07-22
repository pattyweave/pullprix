import { describe, expect, it, vi } from "vitest"

import { handleGitHubWebhookRequest } from "./handler.ts"
import type { GitHubDeliveryRepository } from "./repository.ts"

const secret = "fixture-webhook-secret"
const deliveryId = "72d3162e-cc78-11e3-81ab-4c9367dc0958"

function repository(duplicate = false) {
  return {
    accept: vi.fn().mockResolvedValue({
      delivery_id: "10000000-0000-0000-0000-000000000001",
      delivery_status: "queued",
      duplicate,
    }),
  } satisfies GitHubDeliveryRepository
}

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
    const body =
      '{"action":"submitted","installation":{"id":12345},"reviewer":"Renée"}'
    const deliveryRepository = repository()
    const response = await handleGitHubWebhookRequest(await requestFor(body), {
      repository: deliveryRepository,
      webhookSecret: secret,
    })

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      delivery_id: deliveryId,
      duplicate: false,
      event: "pull_request_review",
    })
    expect(deliveryRepository.accept).toHaveBeenCalledWith({
      action: "submitted",
      eventName: "pull_request_review",
      githubDeliveryId: deliveryId,
      githubInstallationId: 12345,
      payload: {
        action: "submitted",
        installation: { id: 12345 },
        reviewer: "Renée",
      },
    })
  })

  it("rejects a payload changed after signing", async () => {
    const originalBody = '{"action":"submitted"}'
    const request = await requestFor('{"action": "submitted"}', {
      "x-hub-signature-256": await signatureFor(originalBody),
    })
    const response = await handleGitHubWebhookRequest(request, {
      repository: repository(),
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
        { repository: repository(), webhookSecret: secret },
      )

      expect(response.status).toBe(401)
    },
  )

  it("validates GitHub delivery metadata only after signature verification", async () => {
    const response = await handleGitHubWebhookRequest(
      await requestFor("{}", { "x-github-delivery": undefined }),
      { repository: repository(), webhookSecret: secret },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "invalid_github_headers",
    })
  })

  it("rejects malformed JSON after verifying its signature", async () => {
    const deliveryRepository = repository()
    const response = await handleGitHubWebhookRequest(
      await requestFor("this is intentionally not JSON"),
      { repository: deliveryRepository, webhookSecret: secret },
    )

    expect(response.status).toBe(400)
    expect(deliveryRepository.accept).not.toHaveBeenCalled()
  })

  it("acknowledges a redelivery without dispatching another effect", async () => {
    const response = await handleGitHubWebhookRequest(
      await requestFor('{"action":"submitted"}'),
      { repository: repository(true), webhookSecret: secret },
    )

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      duplicate: true,
    })
  })

  it("does not expose database failures", async () => {
    const deliveryRepository = {
      accept: vi.fn().mockRejectedValue(new Error("sensitive database detail")),
    }
    const response = await handleGitHubWebhookRequest(
      await requestFor("{}"),
      { repository: deliveryRepository, webhookSecret: secret },
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: "delivery_persistence_failed",
    })
  })
})
