import { describe, expect, it } from "vitest"

import {
  BrowserConfigurationError,
  readBrowserSupabaseConfig,
} from "./config.ts"

describe("browser Supabase configuration", () => {
  it("returns only the publishable browser configuration", () => {
    expect(
      readBrowserSupabaseConfig({
        VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-value",
        VITE_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "must-not-be-returned",
      }),
    ).toEqual({
      publishableKey: "publishable-value",
      url: "https://example.supabase.co",
    })
  })

  it("names missing or invalid variables without exposing values", () => {
    expect(() =>
      readBrowserSupabaseConfig({
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
        VITE_SUPABASE_URL: "not-a-url",
      }),
    ).toThrowError(
      new BrowserConfigurationError([
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
      ]),
    )
  })
})
