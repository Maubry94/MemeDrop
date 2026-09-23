export const TIKTOK_AUTOPLAY_VALUE = '1' as const
export const TIKTOK_START_COMMANDS = ['mute', 'play'] as const
export const TIKTOK_VOLUME_RETRY_DELAYS_MS = [100, 250, 500, 1_000, 2_000] as const

export type TikTokPlaybackStateAction = 'ended' | 'ignore' | 'started'
export type TikTokImageProgressAction = 'ended' | 'ignored' | 'progressed'

export const shouldRequestTikTokPlayback = (playbackStarted: boolean) =>
  !playbackStarted

export const getTikTokVolumeRetryDelay = (attempt: number) => {
  const normalizedAttempt = Number.isSafeInteger(attempt) && attempt >= 0 ? attempt : 0
  return TIKTOK_VOLUME_RETRY_DELAYS_MS[
    Math.min(normalizedAttempt, TIKTOK_VOLUME_RETRY_DELAYS_MS.length - 1)
  ]
}

export const getTikTokPlaybackStateAction = (
  state: unknown,
  playbackStarted: boolean,
): TikTokPlaybackStateAction => {
  if (state === 1) {
    return 'started'
  }

  if (state === 0 && playbackStarted) {
    return 'ended'
  }

  return 'ignore'
}

export const getTikTokImageProgressAction = ({
  currentIndex,
  playbackStarted,
  previousIndex,
}: {
  currentIndex: number
  playbackStarted: boolean
  previousIndex: number | null
}): TikTokImageProgressAction => {
  if (
    !Number.isSafeInteger(currentIndex) ||
    currentIndex < 0 ||
    (previousIndex !== null && (!Number.isSafeInteger(previousIndex) || previousIndex < 0))
  ) {
    return 'ignored'
  }

  if (previousIndex === null || currentIndex === previousIndex) {
    return 'ignored'
  }

  if (playbackStarted && currentIndex < previousIndex) {
    return 'ended'
  }

  return 'progressed'
}
