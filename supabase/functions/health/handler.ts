const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
} as const

export function handleHealthRequest(request: Request): Response {
  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      {
        status: 405,
        headers: {
          ...JSON_HEADERS,
          allow: "GET",
        },
      },
    )
  }

  return new Response(
    JSON.stringify({
      service: "pull-prix-edge",
      status: "ok",
    }),
    {
      status: 200,
      headers: JSON_HEADERS,
    },
  )
}
