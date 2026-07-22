import { verifyGitHubWebhookSignature } from "./signature.ts"

type GitHubWebhookDependencies = {
  webhookSecret: string
}

const DELIVERY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EVENT_PATTERN = /^[a-z0-9_]+$/

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  })
}

export async function handleGitHubWebhookRequest(
  request: Request,
  dependencies: GitHubWebhookDependencies,
) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: {
        allow: "POST",
        "cache-control": "no-store",
        "content-type": "application/json",
      },
    })
  }

  const rawBody = new Uint8Array(await request.arrayBuffer())
  const signatureValid = await verifyGitHubWebhookSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    dependencies.webhookSecret,
  )

  if (!signatureValid) return json({ error: "invalid_signature" }, 401)

  const deliveryId = request.headers.get("x-github-delivery") ?? ""
  const eventName = request.headers.get("x-github-event") ?? ""

  if (!DELIVERY_PATTERN.test(deliveryId) || !EVENT_PATTERN.test(eventName)) {
    return json({ error: "invalid_github_headers" }, 400)
  }

  // PP-022 will persist and deduplicate these verified raw bytes before any
  // event-specific JSON parsing or asynchronous processing occurs.
  return json(
    {
      accepted: true,
      delivery_id: deliveryId,
      event: eventName,
    },
    202,
  )
}
