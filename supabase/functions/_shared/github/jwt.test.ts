import { generateKeyPairSync, verify } from "node:crypto"
import { describe, expect, it } from "vitest"

import { createGitHubAppJwt, importGitHubPrivateKey } from "./jwt.ts"

describe("GitHub App JWT", () => {
  it("signs GitHub's required RS256 claims from a downloaded PKCS#1 key", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    })
    const pem = privateKey.export({ format: "pem", type: "pkcs1" }).toString()
    const now = new Date("2026-07-23T12:00:00Z")
    const jwt = await createGitHubAppJwt(
      "123456",
      await importGitHubPrivateKey(pem),
      now,
    )
    const [header, payload, signature] = jwt.split(".")

    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    })
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toEqual({
      exp: Math.floor(now.getTime() / 1000) + 540,
      iat: Math.floor(now.getTime() / 1000) - 60,
      iss: "123456",
    })
    expect(verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature!, "base64url"),
    )).toBe(true)
  })
})
