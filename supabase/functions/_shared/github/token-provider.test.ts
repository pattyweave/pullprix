import { generateKeyPairSync } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

import { createGitHubInstallationTokenProvider } from "./token-provider.ts"

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs1" }).toString()
const selectedScope = {
  github_installation_id: 12345,
  repository_ids: [1002, 1001],
  repository_selection: "selected" as const,
}

function tokenResponse(token: string, expiresAt: string) {
  return Response.json({ expires_at: expiresAt, token })
}

describe("GitHub installation token provider", () => {
  it("mints and memory-caches a repository- and permission-restricted token", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      tokenResponse("ghs_APPID_JWT_opaque-token", "2026-07-23T13:00:00Z"),
    ) as unknown as typeof fetch
    const provider = createGitHubInstallationTokenProvider(
      "123456",
      privateKeyPem,
      fetchImplementation,
      () => new Date("2026-07-23T12:00:00Z"),
    )

    await expect(provider.get(selectedScope)).resolves.toBe(
      "ghs_APPID_JWT_opaque-token",
    )
    await provider.get(selectedScope)

    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    const options = fetchImplementation.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(options.body))).toEqual({
      permissions: { pull_requests: "read" },
      repository_ids: [1001, 1002],
    })
    expect(
      (options.headers as Record<string, string>).authorization
        .replace("Bearer ", "")
        .split("."),
    ).toHaveLength(3)
  })

  it("refreshes before expiry and after explicit invalidation", async () => {
    let now = new Date("2026-07-23T12:00:00Z")
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(tokenResponse("token-one", "2026-07-23T13:00:00Z"))
      .mockResolvedValueOnce(tokenResponse("token-two", "2026-07-23T14:00:00Z"))
      .mockResolvedValueOnce(tokenResponse("token-three", "2026-07-23T15:00:00Z")) as unknown as typeof fetch
    const provider = createGitHubInstallationTokenProvider(
      "123456",
      privateKeyPem,
      fetchImplementation,
      () => now,
    )

    await expect(provider.get(selectedScope)).resolves.toBe("token-one")
    now = new Date("2026-07-23T12:56:00Z")
    await expect(provider.get(selectedScope)).resolves.toBe("token-two")
    provider.invalidate(12345)
    await expect(provider.get(selectedScope)).resolves.toBe("token-three")
  })

  it("lets GitHub bound all-repository tokens while retaining read-only permissions", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      tokenResponse("token-all", "2026-07-23T13:00:00Z"),
    ) as unknown as typeof fetch
    const provider = createGitHubInstallationTokenProvider(
      "123456",
      privateKeyPem,
      fetchImplementation,
      () => new Date("2026-07-23T12:00:00Z"),
    )

    await provider.get({
      ...selectedScope,
      repository_ids: [1001],
      repository_selection: "all",
    })

    const options = fetchImplementation.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(options.body))).toEqual({
      permissions: { pull_requests: "read" },
    })
  })

  it("refuses to mint an accidentally broad token for an empty selected scope", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch
    const provider = createGitHubInstallationTokenProvider(
      "123456",
      privateKeyPem,
      fetchImplementation,
    )

    await expect(provider.get({
      ...selectedScope,
      repository_ids: [],
    })).rejects.toThrow("no active repositories")
    expect(fetchImplementation).not.toHaveBeenCalled()
  })
})
