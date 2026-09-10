import type { YouTubeClip } from '../../../shared/types'

const YOUTUBE_ORIGIN = 'https://www.youtube.com'
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_CLIP_ID_PATTERN = /^[A-Za-z0-9_-]{20,100}$/
const YOUTUBE_CLIP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,256}$/
const MAX_YOUTUBE_CLIP_DURATION_MS = 60_000
const CLIP_END_EPSILON_MS = 150
const CLIP_LOOP_END_WINDOW_MS = 1_500
const CLIP_LOOP_REWIND_MS = 500
const CLIP_LOOP_START_WINDOW_MS = 1_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

export const getValidYouTubeClip = (value: unknown): YouTubeClip | null => {
  if (!isRecord(value)) {
    return null
  }

  const { id, token, videoId, startTimeMs, endTimeMs } = value
  if (
    typeof id !== 'string'
    || !YOUTUBE_CLIP_ID_PATTERN.test(id)
    || typeof token !== 'string'
    || !YOUTUBE_CLIP_TOKEN_PATTERN.test(token)
    || typeof videoId !== 'string'
    || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)
    || !Number.isSafeInteger(startTimeMs)
    || !Number.isSafeInteger(endTimeMs)
    || (startTimeMs as number) < 0
    || (endTimeMs as number) <= (startTimeMs as number)
    || (endTimeMs as number) - (startTimeMs as number) > MAX_YOUTUBE_CLIP_DURATION_MS
  ) {
    return null
  }

  return {
    id,
    token,
    videoId,
    startTimeMs: startTimeMs as number,
    endTimeMs: endTimeMs as number,
  }
}

export const createYouTubeEmbedUrl = ({
  videoId,
  clip,
  origin,
}: {
  videoId: unknown
  clip: unknown
  origin: string
}): string => {
  const validClip = getValidYouTubeClip(clip)
  const resolvedVideoId = validClip?.videoId ?? videoId
  if (typeof resolvedVideoId !== 'string' || !YOUTUBE_VIDEO_ID_PATTERN.test(resolvedVideoId)) {
    return ''
  }

  const params = new URLSearchParams({
    autoplay: '1',
    controls: '0',
    disablekb: '1',
    enablejsapi: '1',
    fs: '0',
    iv_load_policy: '3',
    modestbranding: '1',
    origin,
    playsinline: '1',
    rel: '0',
  })
  if (validClip) {
    params.set('clip', validClip.id)
    params.set('clipt', validClip.token)
  }

  return `${YOUTUBE_ORIGIN}/embed/${resolvedVideoId}?${params.toString()}`
}

export const hasYouTubeClipEnded = ({
  clip,
  previousTimeSeconds,
  currentTimeSeconds,
}: {
  clip: unknown
  previousTimeSeconds: number | null
  currentTimeSeconds: number
}): boolean => {
  const validClip = getValidYouTubeClip(clip)
  if (!validClip || !Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) {
    return false
  }

  const currentTimeMs = currentTimeSeconds * 1_000
  if (currentTimeMs >= validClip.endTimeMs - CLIP_END_EPSILON_MS) {
    return true
  }

  if (
    previousTimeSeconds === null
    || !Number.isFinite(previousTimeSeconds)
    || previousTimeSeconds < 0
  ) {
    return false
  }

  const previousTimeMs = previousTimeSeconds * 1_000
  return (
    previousTimeMs >= validClip.endTimeMs - CLIP_LOOP_END_WINDOW_MS
    && currentTimeMs <= validClip.startTimeMs + CLIP_LOOP_START_WINDOW_MS
    && previousTimeMs - currentTimeMs >= CLIP_LOOP_REWIND_MS
  )
}
