const TIKTOK_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
])
const TIKTOK_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_TIKTOK_URL_LENGTH = 2048
const MAX_TIKTOK_REDIRECTS = 5
const TIKTOK_FETCH_TIMEOUT_MS = 5000

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

const parseTikTokUrl = (value: string, allowHttpUpgrade: boolean): URL | null => {
  const trimmedValue = value.trim()
  if (
    !trimmedValue ||
    trimmedValue.length > MAX_TIKTOK_URL_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(trimmedValue)
  ) {
    return null
  }

  try {
    const normalizedValue = /^https?:\/\//i.test(trimmedValue)
      ? trimmedValue
      : `https://${trimmedValue}`
    const url = new URL(normalizedValue)
    const hostname = url.hostname.toLowerCase()

    if (
      !TIKTOK_HOSTS.has(hostname) ||
      url.username ||
      url.password ||
      url.port ||
      (url.protocol !== 'https:' && !(allowHttpUpgrade && url.protocol === 'http:'))
    ) {
      return null
    }

    url.protocol = 'https:'
    url.hostname = hostname
    url.hash = ''
    return url
  } catch {
    return null
  }
}

const getVideoIdFromUrl = (url: URL): string | null => {
  const [, firstPart, secondPart, thirdPart] = url.pathname.split('/')

  if (firstPart === 'embed' && secondPart === 'v2') {
    return thirdPart ?? null
  }

  if (firstPart === 'player' && secondPart === 'v1') {
    return thirdPart ?? null
  }

  if (secondPart === 'video') {
    return thirdPart ?? null
  }

  return null
}

export const getTikTokVideoId = (value: string): string | null => {
  const url = parseTikTokUrl(value, true)
  return url ? getVideoIdFromUrl(url) : null
}

export const isValidTikTokVideoId = (value: string): boolean => /^\d{10,30}$/.test(value)

const cancelResponseBody = async (response: Response) => {
  try {
    await response.body?.cancel()
  } catch {
    // The response may already have been closed by the remote peer.
  }
}

export const resolveTikTokVideo = async (
  value: string,
  fetchImplementation: FetchImplementation = fetch,
): Promise<{ id: string; url: string } | null> => {
  const initialUrl = parseTikTokUrl(value, true)
  if (!initialUrl) {
    return null
  }

  const directId = getVideoIdFromUrl(initialUrl)
  if (directId && isValidTikTokVideoId(directId)) {
    return {
      id: directId,
      url: initialUrl.toString(),
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIKTOK_FETCH_TIMEOUT_MS)
  let currentUrl = initialUrl

  try {
    for (let redirectCount = 0; redirectCount <= MAX_TIKTOK_REDIRECTS; redirectCount += 1) {
      const response = await fetchImplementation(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'MemeDrop/1.0',
        },
      })

      try {
        if (!TIKTOK_REDIRECT_STATUSES.has(response.status)) {
          const responseUrl = response.url
            ? parseTikTokUrl(response.url, false)
            : currentUrl
          const resolvedId = responseUrl ? getVideoIdFromUrl(responseUrl) : null

          if (response.ok && responseUrl && resolvedId && isValidTikTokVideoId(resolvedId)) {
            return {
              id: resolvedId,
              url: responseUrl.toString(),
            }
          }

          return null
        }

        if (redirectCount >= MAX_TIKTOK_REDIRECTS) {
          return null
        }

        const location = response.headers.get('location')
        if (!location || location.length > MAX_TIKTOK_URL_LENGTH) {
          return null
        }

        let redirectUrl: URL
        try {
          redirectUrl = new URL(location, currentUrl)
        } catch {
          return null
        }

        const safeRedirectUrl = parseTikTokUrl(redirectUrl.toString(), false)
        if (!safeRedirectUrl) {
          return null
        }

        const resolvedId = getVideoIdFromUrl(safeRedirectUrl)
        if (resolvedId && isValidTikTokVideoId(resolvedId)) {
          return {
            id: resolvedId,
            url: safeRedirectUrl.toString(),
          }
        }

        currentUrl = safeRedirectUrl
      } finally {
        await cancelResponseBody(response)
      }
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }

  return null
}
