export const getYouTubeVideoId = (value: string): string | null => {
  try {
    const normalizedValue = value.match(/^https?:\/\//i) ? value : `https://${value}`
    const url = new URL(normalizedValue)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()

    if (host === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] ?? null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v')
      }

      const [, kind, id] = url.pathname.split('/')
      if (kind && ['embed', 'shorts', 'live'].includes(kind)) {
        return id ?? null
      }
    }
  } catch {
    return null
  }

  return null
}

export const isValidYouTubeVideoId = (value: string): boolean => /^[a-zA-Z0-9_-]{11}$/.test(value)
