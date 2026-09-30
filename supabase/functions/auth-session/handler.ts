type Config = { supabaseUrl: string; apiKey: string; appOrigin: string }
export function createAuthSessionHandler(config: Config, fetcher: typeof fetch = fetch) {
  return async (request: Request) => {
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': config.appOrigin,
      'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'Origin' }
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
    if (request.headers.get('origin') !== config.appOrigin) return reply({ error: 'origin_not_allowed' }, 403)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405)
    try {
      const body = await request.json()
      let path: string, payload: unknown
      if (body.action === 'exchange' && typeof body.code === 'string' && body.code.length <= 2048 &&
        typeof body.verifier === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(body.verifier)) {
        path = '/auth/v1/token?grant_type=pkce'; payload = { auth_code: body.code, code_verifier: body.verifier }
      } else if (body.action === 'refresh' && typeof body.refreshToken === 'string' && body.refreshToken.length <= 2048) {
        path = '/auth/v1/token?grant_type=refresh_token'; payload = { refresh_token: body.refreshToken }
      } else if (body.action === 'logout') {
        const token = request.headers.get('authorization')
        if (!token?.startsWith('Bearer ')) return reply({ error: 'unauthorized' }, 401)
        const response = await fetcher(`${config.supabaseUrl}/auth/v1/logout?scope=local`, { method: 'POST',
          headers: { apikey: config.apiKey, authorization: token }, signal: AbortSignal.timeout(10000) })
        return response.ok ? reply({ signedOut: true }) : reply({ error: 'sign_out_failed' }, response.status === 401 ? 401 : 502)
      } else return reply({ error: 'invalid_request' }, 400)
      const response = await fetcher(`${config.supabaseUrl}${path}`, { method: 'POST', headers: { apikey: config.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) })
      if (!response.ok) return reply({ error: 'authentication_failed' }, 401)
      const session = await response.json()
      if (typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string' || !Number.isFinite(session.expires_in)) return reply({ error: 'invalid_auth_response' }, 502)
      // Allowlist application session fields. GitHub provider tokens never cross
      // this boundary and are not logged or persisted by Pull Prix.
      return reply({ accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: Date.now() + session.expires_in * 1000 })
    } catch { return reply({ error: 'authentication_unavailable' }, 503) }
  }
}
