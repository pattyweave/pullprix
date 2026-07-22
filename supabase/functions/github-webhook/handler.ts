import { verifyGitHubWebhookSignature } from "./signature.ts"
import type { GitHubDeliveryRepository } from "./repository.ts"

type GitHubWebhookDependencies = {
  repository: GitHubDeliveryRepository
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

  let payload: Record<string, unknown>
  try {
    const parsed = JSON.parse(new TextDecoder().decode(rawBody)) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "invalid_json_payload" }, 400)
    }
    payload = parsed as Record<string, unknown>
  } catch {
    return json({ error: "invalid_json_payload" }, 400)
  }

  const action = typeof payload.action === "string" ? payload.action : null
  const installation = payload.installation
  const rawInstallationId =
    installation && typeof installation === "object" && !Array.isArray(installation)
      ? (installation as Record<string, unknown>).id
      : null
  const installationId =
    typeof rawInstallationId === "number" &&
      Number.isSafeInteger(rawInstallationId) &&
      rawInstallationId > 0
      ? rawInstallationId
      : null

  try {
    const accepted = await dependencies.repository.accept({
      action,
      eventName,
      githubDeliveryId: deliveryId,
      githubInstallationId: installationId,
      payload,
    })

    return json(
      {
        accepted: true,
        delivery_id: deliveryId,
        duplicate: accepted.duplicate,
        event: eventName,
      },
      202,
    )
  } catch {
    return json({ error: "delivery_persistence_failed" }, 500)
  }
}
