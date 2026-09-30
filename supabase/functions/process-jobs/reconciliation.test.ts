import { describe, expect, it, vi } from "vitest"
import { createReconciliationProcessor } from "./reconciliation.ts"

const installation = { id: 123, app_id: 456, account: { id: 789, login: "team", type: "Organization" },
  created_at: "2026-07-01T00:00:00Z", updated_at: "2026-09-26T00:00:00Z", suspended_at: null,
  repository_selection: "selected" }
const repo = { id: 1001, name: "api", full_name: "team/api", private: true }
function setup() {
  const repository = { get: vi.fn().mockResolvedValue({ installation: "revision" }), commit: vi.fn().mockResolvedValue({ disposition: "applied" }) }
  const api = { snapshot: vi.fn().mockResolvedValue({ installation, repositories: [repo] }) }
  return { repository, api, process: createReconciliationProcessor(repository, () => api) }
}
describe("installation reconciliation processor", () => {
  it("normalizes a complete API snapshot before a single transactional commit", async () => {
    const s = setup()
    await s.process({ github_installation_id: 123 })
    expect(s.repository.commit).toHaveBeenCalledWith(123, { installation: "revision" }, expect.objectContaining({
      state: "active", account_id: 789, account_login: "team", repositories: [{ github_repository_id: 1001,
        owner: "team", name: "api", full_name: "team/api", active: true, private: true }],
    }), expect.any(String))
  })
  it("does not fetch deleted scope or commit failed API reads", async () => {
    const s = setup()
    s.repository.get.mockResolvedValueOnce(null)
    await expect(s.process({ github_installation_id: 123 })).resolves.toEqual({ disposition: "stale_or_deleted" })
    expect(s.api.snapshot).not.toHaveBeenCalled()
    s.api.snapshot.mockRejectedValue(new Error("API unavailable"))
    await expect(s.process({ github_installation_id: 123 })).rejects.toThrow("API unavailable")
    expect(s.repository.commit).not.toHaveBeenCalled()
  })
  it("handles missing installations and malformed snapshots without guessing repositories", async () => {
    const s = setup()
    s.api.snapshot.mockResolvedValueOnce({ installation: null, repositories: [] })
    await s.process({ github_installation_id: 123 })
    expect(s.repository.commit.mock.calls[0][2]).toEqual({ state: "deleted" })
    s.api.snapshot.mockResolvedValueOnce({ installation: { ...installation, account: null }, repositories: [] })
    await expect(s.process({ github_installation_id: 123 })).rejects.toThrow()
    expect(s.repository.commit).toHaveBeenCalledTimes(1)
  })
})
