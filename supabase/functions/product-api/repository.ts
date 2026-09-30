import { ProductError, type ProductInput } from './model.ts'
/** Keep the user's Authorization header: this RPC is not a service-role read. */
export function createProductLoader(url: string, apiKey: string, transport: typeof fetch = fetch) {
  return async (token: string, installationId: number, seasonId: string, health: boolean): Promise<ProductInput> => {
    const response = await transport(`${url}/rest/v1/rpc/get_product_api_input`, {
      method: 'POST', headers: { apikey: apiKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_installation_id: installationId, p_season_id: seasonId, p_health: health }),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    })
    if (!response.ok) {
      if (response.status === 401) throw new ProductError(401, 'sign_in_again')
      if (response.status === 403) throw new ProductError(403, 'access_denied')
      throw new ProductError(503, 'product_unavailable')
    }
    return response.json()
  }
}

export function createHistoryLoader(url: string, apiKey: string, transport: typeof fetch = fetch) {
  return async (token: string, installationId: number, seasonId: string | undefined, offset: number, limit: number) => {
    const response = await transport(`${url}/rest/v1/rpc/get_season_history`, { method: 'POST',
      headers: { apikey: apiKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_installation_id: installationId, p_season_id: seasonId ?? null, p_offset: offset, p_limit: limit }),
      signal: AbortSignal.timeout(15000), redirect: 'error' })
    if (!response.ok) throw new ProductError(response.status === 401 ? 401 : response.status === 403 ? 403 : response.status === 404 ? 404 : 503,
      response.status === 401 ? 'sign_in_again' : response.status === 403 ? 'access_denied' : response.status === 404 ? 'season_not_found' : 'product_unavailable')
    return response.json()
  }
}
