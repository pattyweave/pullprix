function concat(...arrays: Uint8Array[]) {
  const output = new Uint8Array(
    arrays.reduce((length, array) => length + array.length, 0),
  )
  let offset = 0
  for (const array of arrays) {
    output.set(array, offset)
    offset += array.length
  }
  return output
}

function derLength(length: number) {
  if (length < 128) return new Uint8Array([length])

  const bytes: number[] = []
  for (let remaining = length; remaining > 0; remaining >>= 8) {
    bytes.unshift(remaining & 0xff)
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes])
}

function der(tag: number, value: Uint8Array) {
  return concat(new Uint8Array([tag]), derLength(value.length), value)
}

function pemBytes(privateKey: string) {
  const body = privateKey
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/, "")
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/, "")
    .replace(/\s/g, "")
  const binary = atob(body)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function pkcs1ToPkcs8(pkcs1: Uint8Array) {
  const version = new Uint8Array([0x02, 0x01, 0x00])
  const rsaEncryptionAlgorithm = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
    0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ])
  return der(0x30, concat(version, rsaEncryptionAlgorithm, der(0x04, pkcs1)))
}

function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

export async function importGitHubPrivateKey(privateKey: string) {
  const bytes = pemBytes(privateKey)
  const pkcs8 = privateKey.includes("BEGIN RSA PRIVATE KEY")
    ? pkcs1ToPkcs8(bytes)
    : bytes

  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
}

export async function createGitHubAppJwt(
  appId: string,
  privateKey: CryptoKey,
  now = new Date(),
) {
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = base64Url(JSON.stringify({
    exp: nowSeconds + 9 * 60,
    iat: nowSeconds - 60,
    iss: appId,
  }))
  const signingInput = `${header}.${payload}`
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  ))

  return `${signingInput}.${base64Url(signature)}`
}
