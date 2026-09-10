const YOUTUBE_ORIGIN = 'https://www.youtube.com'
const YOUTUBE_VIDEO_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
])
const YOUTUBE_CLIP_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
])
const MAX_YOUTUBE_URL_LENGTH = 2048
const MIN_YOUTUBE_CLIP_ID_LENGTH = 20
const MAX_YOUTUBE_CLIP_ID_LENGTH = 100
const MAX_YOUTUBE_CLIP_TOKEN_LENGTH = 256
const MAX_YOUTUBE_CLIP_DURATION_MS = 60_000
const MAX_YOUTUBE_RESPONSE_BYTES = 4 * 1024 * 1024
const YOUTUBE_FETCH_TIMEOUT_MS = 7_000

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type ResolvedYouTubeVideo = {
  id: string
  url: string
  clip: {
    id: string
    token: string
    videoId: string
    startTimeMs: number
    endTimeMs: number
  } | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const isValidYouTubeClipValue = (
  value: string,
  maximumLength: number,
  minimumLength = 1,
): boolean =>
  value.length >= minimumLength
  && value.length <= maximumLength
  && /^[A-Za-z0-9_-]+$/.test(value)

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const characterCode = character.charCodeAt(0)
    if (characterCode <= 0x1f || characterCode === 0x7f) {
      return true
    }
  }

  return false
}

const parseStrictYouTubeUrl = (value: string): URL | null => {
  const trimmedValue = value.trim()
  if (
    !trimmedValue ||
    trimmedValue.length > MAX_YOUTUBE_URL_LENGTH ||
    hasControlCharacter(trimmedValue)
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
      !YOUTUBE_VIDEO_HOSTS.has(hostname) ||
      url.username ||
      url.password ||
      url.port ||
      (url.protocol !== 'https:' && url.protocol !== 'http:')
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

const getStrictDirectVideoId = (url: URL): string | null => {
  if (url.hostname === 'youtu.be') {
    const pathParts = url.pathname.split('/').filter(Boolean)
    return pathParts.length === 1 ? pathParts[0] ?? null : null
  }

  if (url.pathname === '/watch') {
    return url.searchParams.get('v')
  }

  const pathParts = url.pathname.split('/').filter(Boolean)
  if (pathParts.length !== 2 || !['embed', 'shorts', 'live'].includes(pathParts[0] ?? '')) {
    return null
  }

  return pathParts[1] ?? null
}

const getStrictClipId = (url: URL): string | null => {
  if (!YOUTUBE_CLIP_HOSTS.has(url.hostname)) {
    return null
  }

  const pathMatch = /^\/clip\/([A-Za-z0-9_-]+)$/.exec(url.pathname)
  const clipId = pathMatch?.[1] ?? null
  return clipId && isValidYouTubeClipValue(
    clipId,
    MAX_YOUTUBE_CLIP_ID_LENGTH,
    MIN_YOUTUBE_CLIP_ID_LENGTH,
  )
    ? clipId
    : null
}

const createCanonicalVideoUrl = (videoId: string) =>
  `${YOUTUBE_ORIGIN}/watch?v=${encodeURIComponent(videoId)}`

const createCanonicalClipUrl = (clipId: string) =>
  `${YOUTUBE_ORIGIN}/clip/${encodeURIComponent(clipId)}`

const createClipRequestUrl = (clipId: string) => {
  const url = new URL(createCanonicalClipUrl(clipId))
  url.searchParams.set('cbrd', '1')
  url.searchParams.set('ucbcb', '1')
  url.searchParams.set('hl', 'en')
  return url.toString()
}

const cancelResponseBody = async (response: Response) => {
  try {
    await response.body?.cancel()
  } catch {
    // The response may already have been closed by the remote peer.
  }
}

const readBoundedResponseText = async (response: Response): Promise<string | null> => {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength) {
    const parsedLength = Number(declaredLength)
    if (Number.isFinite(parsedLength) && parsedLength > MAX_YOUTUBE_RESPONSE_BYTES) {
      await cancelResponseBody(response)
      return null
    }
  }

  if (!response.body) {
    return ''
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let decodedText = ''
  let decodedBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        decodedText += decoder.decode()
        return decodedText
      }

      decodedBytes += value.byteLength
      if (decodedBytes > MAX_YOUTUBE_RESPONSE_BYTES) {
        await reader.cancel()
        return null
      }

      decodedText += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

const PLAYER_RESPONSE_ASSIGNMENT =
  /(?:\b(?:var|let|const)\s+ytInitialPlayerResponse|\bwindow\s*\[\s*["']ytInitialPlayerResponse["']\s*\]|["']ytInitialPlayerResponse["'])\s*[:=]\s*/g

const extractJsonObject = (source: string, startIndex: number): string | null => {
  let index = startIndex
  while (/\s/.test(source[index] ?? '')) {
    index += 1
  }

  if (source[index] !== '{') {
    return null
  }

  const objectStart = index
  let depth = 0
  let isInString = false
  let isEscaped = false

  for (; index < source.length; index += 1) {
    const character = source[index]

    if (isInString) {
      if (isEscaped) {
        isEscaped = false
      } else if (character === '\\') {
        isEscaped = true
      } else if (character === '"') {
        isInString = false
      }
      continue
    }

    if (character === '"') {
      isInString = true
    } else if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(objectStart, index + 1)
      }
      if (depth < 0) {
        return null
      }
    }
  }

  return null
}

const parseInitialPlayerResponse = (html: string): Record<string, unknown> | null => {
  PLAYER_RESPONSE_ASSIGNMENT.lastIndex = 0

  while (PLAYER_RESPONSE_ASSIGNMENT.exec(html) !== null) {
    const jsonSource = extractJsonObject(html, PLAYER_RESPONSE_ASSIGNMENT.lastIndex)
    if (!jsonSource) {
      continue
    }

    try {
      const value: unknown = JSON.parse(jsonSource)
      if (
        isRecord(value)
        && isRecord(value.videoDetails)
        && isRecord(value.clipConfig)
      ) {
        return value
      }
    } catch {
      // Continue in case another valid assignment follows this candidate.
    }
  }

  return null
}

const parseTimeInMilliseconds = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null
  }

  const parsedValue = Number(value)
  return Number.isSafeInteger(parsedValue) ? parsedValue : null
}

const getIframeUrl = (playerResponse: Record<string, unknown>): string | null => {
  const microformat = playerResponse.microformat
  if (!isRecord(microformat)) {
    return null
  }

  const renderer = microformat.playerMicroformatRenderer
  if (!isRecord(renderer)) {
    return null
  }

  const embed = renderer.embed
  return isRecord(embed) && typeof embed.iframeUrl === 'string'
    ? embed.iframeUrl
    : null
}

const parseResolvedClip = (
  playerResponse: Record<string, unknown>,
  requestedClipId: string,
): ResolvedYouTubeVideo | null => {
  const videoDetails = playerResponse.videoDetails
  const clipConfig = playerResponse.clipConfig
  if (!isRecord(videoDetails) || !isRecord(clipConfig)) {
    return null
  }

  const videoId = videoDetails.videoId
  const postId = clipConfig.postId
  const startTimeMs = parseTimeInMilliseconds(clipConfig.startTimeMs)
  const endTimeMs = parseTimeInMilliseconds(clipConfig.endTimeMs)

  if (
    typeof videoId !== 'string' ||
    !isValidYouTubeVideoId(videoId) ||
    typeof postId !== 'string' ||
    postId !== requestedClipId ||
    !isValidYouTubeClipValue(
      postId,
      MAX_YOUTUBE_CLIP_ID_LENGTH,
      MIN_YOUTUBE_CLIP_ID_LENGTH,
    ) ||
    startTimeMs === null ||
    endTimeMs === null ||
    endTimeMs <= startTimeMs ||
    endTimeMs - startTimeMs > MAX_YOUTUBE_CLIP_DURATION_MS
  ) {
    return null
  }

  const iframeValue = getIframeUrl(playerResponse)
  if (!iframeValue || iframeValue.length > MAX_YOUTUBE_URL_LENGTH) {
    return null
  }

  try {
    const iframeUrl = new URL(iframeValue)
    const clipValues = iframeUrl.searchParams.getAll('clip')
    const tokenValues = iframeUrl.searchParams.getAll('clipt')
    const token = tokenValues[0]

    if (
      iframeUrl.origin !== YOUTUBE_ORIGIN ||
      iframeUrl.username ||
      iframeUrl.password ||
      iframeUrl.port ||
      iframeUrl.pathname !== `/embed/${videoId}` ||
      iframeUrl.hash ||
      clipValues.length !== 1 ||
      clipValues[0] !== postId ||
      tokenValues.length !== 1 ||
      typeof token !== 'string' ||
      !isValidYouTubeClipValue(token, MAX_YOUTUBE_CLIP_TOKEN_LENGTH)
    ) {
      return null
    }

    return {
      id: videoId,
      url: createCanonicalClipUrl(postId),
      clip: {
        id: postId,
        token,
        videoId,
        startTimeMs,
        endTimeMs,
      },
    }
  } catch {
    return null
  }
}

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

export const resolveYouTubeVideo = async (
  value: string,
  fetchImplementation: FetchImplementation = fetch,
): Promise<ResolvedYouTubeVideo | null> => {
  const inputUrl = parseStrictYouTubeUrl(value)
  if (!inputUrl) {
    return null
  }

  const directVideoId = getStrictDirectVideoId(inputUrl)
  if (directVideoId && isValidYouTubeVideoId(directVideoId)) {
    return {
      id: directVideoId,
      url: createCanonicalVideoUrl(directVideoId),
      clip: null,
    }
  }

  const clipId = getStrictClipId(inputUrl)
  if (!clipId) {
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), YOUTUBE_FETCH_TIMEOUT_MS)

  try {
    const response = await fetchImplementation(createClipRequestUrl(clipId), {
      redirect: 'error',
      signal: controller.signal,
      headers: {
        accept: 'text/html',
        'user-agent': 'MemeDrop/1.0',
      },
    })

    const contentType = response.headers.get('content-type')
    if (
      !response.ok ||
      response.redirected ||
      !contentType ||
      contentType.split(';', 1)[0]?.trim().toLowerCase() !== 'text/html'
    ) {
      await cancelResponseBody(response)
      return null
    }

    const html = await readBoundedResponseText(response)
    if (html === null) {
      return null
    }

    const playerResponse = parseInitialPlayerResponse(html)
    return playerResponse ? parseResolvedClip(playerResponse, clipId) : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
