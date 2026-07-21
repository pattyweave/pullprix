import { describe, expect, it } from "vitest"

import { handleHealthRequest } from "./handler.ts"

describe("health Edge Function", () => {
  it("returns a non-cacheable health response", async () => {
    const response = handleHealthRequest(
      new Request("http://localhost/functions/v1/health"),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    await expect(response.json()).resolves.toEqual({
      service: "pull-prix-edge",
      status: "ok",
    })
  })

  it("rejects unsupported methods", async () => {
    const response = handleHealthRequest(
      new Request("http://localhost/functions/v1/health", {
        method: "POST",
      }),
    )

    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("GET")
    await expect(response.json()).resolves.toEqual({
      error: "method_not_allowed",
    })
  })
})
