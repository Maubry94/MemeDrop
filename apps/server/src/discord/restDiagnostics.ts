import type { APIRequest, Client, ResponseLike } from 'discord.js'
import { logDiscordRestResponse } from './diagnostics.js'

function getObservedRoute(request: APIRequest) {
  // Never log the original path: both endpoints contain an interaction token.
  const path = request.path.split('?')[0]
  if (
    request.method === 'POST'
    && /^\/interactions\/\d+\/[^/?#]+\/callback$/.test(path ?? '')
  ) {
    return { route: 'interaction-callback', method: 'POST' } as const
  }
  if (
    request.method === 'PATCH'
    && /^\/webhooks\/\d+\/[^/?#]+\/messages\/@original$/.test(path ?? '')
  ) {
    return { route: 'original-response', method: 'PATCH' } as const
  }
  return null
}

function getRetryAfterMs(response: ResponseLike): number | undefined {
  const value = response.headers.get('retry-after')
  if (value === null || value.trim() === '') return undefined
  const seconds = Number(value)
  const milliseconds = seconds * 1_000
  return Number.isFinite(milliseconds) && milliseconds >= 0
    ? milliseconds
    : undefined
}

/** Observe requests without changing Discord's retry or rate-limit behavior. */
export function attachDiscordRestDiagnostics(rest: Client['rest']): () => void {
  const onResponse = (request: APIRequest, response: ResponseLike) => {
    const route = getObservedRoute(request)
    if (!route) return

    // The response event also covers callback (BurstHandler) HTTP 429s, unlike
    // the rateLimited event. No response body or arbitrary headers are read.
    logDiscordRestResponse({
      ...route,
      status: response.status,
      // Discord.js increments this for network/5xx retries, but not for 429s.
      // Each 429 is recorded separately through the response event above.
      retries: request.retries,
      retryAfterMs: getRetryAfterMs(response),
    })
  }

  rest.on('response', onResponse)
  return () => { rest.off('response', onResponse) }
}
