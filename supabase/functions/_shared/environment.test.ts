import { describe, expect, it } from "vitest"

import {
  ConfigurationError,
  readGitHubApiEnvironment,
  readGithubWebhookEnvironment,
  readServerEnvironment,
} from "./environment.ts"

const validEnvironment = {
  APP_URL: "https://pullprix.com",
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY:
    "-----BEGIN RSA PRIVATE KEY-----\\nprivate-material\\n-----END RSA PRIVATE KEY-----",
  GITHUB_WEBHOOK_SECRET: "webhook-value",
  SUPABASE_SECRET_KEY: "server-value",
  SUPABASE_URL: "https://example.supabase.co",
}

describe("server environment", () => {
  it("validates and normalizes server-only configuration", () => {
    expect(readServerEnvironment(validEnvironment)).toEqual({
      appUrl: "https://pullprix.com",
      githubAppId: "123456",
      githubPrivateKey:
        "-----BEGIN RSA PRIVATE KEY-----\nprivate-material\n-----END RSA PRIVATE KEY-----",
      githubWebhookSecret: "webhook-value",
      supabaseSecretKey: "server-value",
      supabaseUrl: "https://example.supabase.co",
    })
  })

  it("supports the legacy service-role variable during key migration", () => {
    const { SUPABASE_SECRET_KEY: _, ...legacyEnvironment } = validEnvironment

    expect(
      readServerEnvironment({
        ...legacyEnvironment,
        SUPABASE_SERVICE_ROLE_KEY: "legacy-server-value",
      }).supabaseSecretKey,
    ).toBe("legacy-server-value")
  })

  it("supports Supabase's hosted secret dictionary", () => {
    const { SUPABASE_SECRET_KEY: _, ...hostedEnvironment } = validEnvironment

    expect(
      readServerEnvironment({
        ...hostedEnvironment,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "hosted-value" }),
      }).supabaseSecretKey,
    ).toBe("hosted-value")
  })

  it("prefers a least-privilege automation key when configured", () => {
    const { SUPABASE_SECRET_KEY: _, ...hostedEnvironment } = validEnvironment

    expect(
      readServerEnvironment({
        ...hostedEnvironment,
        SUPABASE_SECRET_KEYS: JSON.stringify({
          automations: "automation-value",
          default: "hosted-value",
        }),
      }).supabaseSecretKey,
    ).toBe("automation-value")
  })

  it("reports variable names without leaking their values", () => {
    const invalidEnvironment = {
      ...validEnvironment,
      APP_URL: "private-bad-url",
      GITHUB_APP_PRIVATE_KEY: "private-bad-key",
      SUPABASE_SECRET_KEY: "",
    }

    let error: unknown
    try {
      readServerEnvironment(invalidEnvironment)
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(ConfigurationError)
    expect(String(error)).toContain("APP_URL")
    expect(String(error)).toContain("GITHUB_APP_PRIVATE_KEY")
    expect(String(error)).toContain("SUPABASE_SECRET_KEY")
    expect(String(error)).not.toContain("private-bad-url")
    expect(String(error)).not.toContain("private-bad-key")
  })

  it("validates only the secret required by the public webhook", () => {
    expect(
      readGithubWebhookEnvironment({
        GITHUB_WEBHOOK_SECRET: " webhook-value ",
      }),
    ).toEqual({ githubWebhookSecret: "webhook-value" })

    expect(() => readGithubWebhookEnvironment({})).toThrowError(
      new ConfigurationError(["GITHUB_WEBHOOK_SECRET"]),
    )
  })

  it("validates only app authentication and database values for GitHub API work", () => {
    expect(readGitHubApiEnvironment(validEnvironment)).toEqual({
      githubAppId: "123456",
      githubPrivateKey:
        "-----BEGIN RSA PRIVATE KEY-----\nprivate-material\n-----END RSA PRIVATE KEY-----",
      supabaseSecretKey: "server-value",
      supabaseUrl: "https://example.supabase.co",
    })
  })
})
