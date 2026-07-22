const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2)

  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16)
  }

  return bytes
}

export async function verifyGitHubWebhookSignature(
  body: Uint8Array,
  signatureHeader: string | null,
  secret: string,
) {
  const match = signatureHeader?.match(SIGNATURE_PATTERN)
  if (!match) return false

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  )

  return crypto.subtle.verify(
    "HMAC",
    key,
    hexToBytes(match[1]),
    body,
  )
}
