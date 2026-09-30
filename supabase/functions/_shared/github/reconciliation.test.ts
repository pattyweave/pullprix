import { generateKeyPairSync } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import { createGitHubReconciliationClient } from "./reconciliation.ts"
import { GitHubRateLimitError } from "./rate-limit.ts"

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs1" }).toString()
const installation = { id: 123, app_id: 456, suspended_at: null }
function setup(responses: Response[]) {
  const request = vi.fn()
  for (const response of responses) request.mockResolvedValueOnce(response)
  return { request, client: createGitHubReconciliationClient("456", pem, request, "https://github.test") }
}
describe("GitHub reconciliation discovery", () => {
  it("discovers all currently granted repos without the stale local repository restriction", async () => {
    const first = Array.from({ length: 100 }, (_, id) => ({ id: id+1 }))
    const s = setup([Response.json(installation), Response.json({ token: "discovery-token" }),
      Response.json({ repositories: first, total_count: 101 }), Response.json({ repositories: [{ id: 101 }], total_count: 101 })])
    await expect(s.client.snapshot(123)).resolves.toMatchObject({ repositories: [...first, { id: 101 }] })
    expect(JSON.parse(s.request.mock.calls[1][1].body)).toEqual({ permissions: { metadata: "read" } })
    expect(s.request.mock.calls[3][0]).toBe("https://github.test/installation/repositories?per_page=100&page=2")
    expect(s.request.mock.calls[2][1].headers.authorization).toBe("Bearer discovery-token")
  })
  it("does not request tokens for missing or suspended installations", async () => {
    const missing = setup([new Response(null, { status: 404 })])
    await expect(missing.client.snapshot(123)).resolves.toEqual({ installation: null, repositories: [] })
    expect(missing.request).toHaveBeenCalledTimes(1)
    const suspended = setup([Response.json({ ...installation, suspended_at: "2026-09-25T00:00:00Z" })])
    await expect(suspended.client.snapshot(123)).resolves.toMatchObject({ repositories: [] })
    expect(suspended.request).toHaveBeenCalledTimes(1)
  })
  it("rejects partial lists, changed counts, duplicates, and unexpected app identity", async () => {
    for (const data of [ { repositories: [{ id: 1 }], total_count: 2 },
      { repositories: [{ id: 1 }, { id: 1 }], total_count: 2 } ]) {
      const s = setup([Response.json(installation), Response.json({ token: "token" }), Response.json(data)])
      await expect(s.client.snapshot(123)).rejects.toThrow(/snapshot/)
    }
    const changed = setup([Response.json(installation), Response.json({ token: "token" }),
      Response.json({ repositories: Array.from({ length: 100 }, (_, id) => ({ id })), total_count: 101 }),
      Response.json({ repositories: [{ id: 101 }], total_count: 102 })])
    await expect(changed.client.snapshot(123)).rejects.toThrow("scope changed")
    const wrong = setup([Response.json({ ...installation, app_id: 789 })])
    await expect(wrong.client.snapshot(123)).rejects.toThrow("Invalid GitHub installation snapshot")
  })
  it("exposes retry hints without treating auth, rate limits or outages as missing installations", async () => {
    const rate = setup([new Response("private", { status: 429, headers: { "retry-after": "90" } })])
    await expect(rate.client.snapshot(123)).rejects.toBeInstanceOf(GitHubRateLimitError)
    for (const status of [401, 403, 500]) {
      const s = setup([new Response("private", { status })])
      await expect(s.client.snapshot(123)).rejects.toThrow(`GitHub installation snapshot failed with status ${status}`)
    }
  })
})
