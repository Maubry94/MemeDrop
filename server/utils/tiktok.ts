const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'])

const normalizeTikTokUrl = (value: string) => {
  const normalizedValue = value.match(/^https?:\/\//i) ? value : `https://${value}`
  return new URL(normalizedValue)
}

export const getTikTokVideoId = (value: string): string | null => {
  try {
    const url = normalizeTikTokUrl(value)
    const host = url.hostname.toLowerCase()

    if (!TIKTOK_HOSTS.has(host)) {
      return null
    }

    const [, firstPart, secondPart, thirdPart] = url.pathname.split('/')

    if (firstPart === 'embed' && secondPart === 'v2') {
      return thirdPart ?? null
    }

    if (secondPart === 'video') {
      return thirdPart ?? null
    }
  } catch {
    return null
  }

  return null
}

export const isValidTikTokVideoId = (value: string): boolean => /^\d{10,30}$/.test(value)

export const resolveTikTokVideo = async (
  value: string,
): Promise<{ id: string; url: string } | null> => {
  try {
    const directUrl = normalizeTikTokUrl(value)
    const directId = getTikTokVideoId(directUrl.toString())

    if (directId && isValidTikTokVideoId(directId)) {
      return {
        id: directId,
        url: directUrl.toString(),
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      const response = await fetch(directUrl, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': 'MemeDrop/1.0',
        },
      })
      const resolvedId = getTikTokVideoId(response.url)

      if (resolvedId && isValidTikTokVideoId(resolvedId)) {
        return {
          id: resolvedId,
          url: response.url,
        }
      }
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return null
  }

  return null
}
