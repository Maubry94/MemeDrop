export type PlaybackProgressAction =
  | 'ended'
  | 'ignored'
  | 'progressed'
  | 'restarted'
  | 'rewound'

const PROGRESS_EPSILON_SECONDS = 0.05
const REWIND_EPSILON_SECONDS = 0.5
const END_EPSILON_SECONDS = 0.2
const LOOP_END_WINDOW_SECONDS = 1.5
const LOOP_START_WINDOW_SECONDS = 1

const isValidTime = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const getValidDuration = (value: number | null | undefined) =>
  isValidTime(value) && value > 0 ? value : null

/**
 * Classifies a playback sample without treating every backwards seek as
 * progress. Embedded players can occasionally omit their ended event and
 * restart at zero; that transition must complete the drop instead of keeping
 * its stall watchdog alive forever.
 */
export const getPlaybackProgressAction = ({
  completeAtDuration = true,
  currentTimeSeconds,
  durationSeconds,
  previousTimeSeconds,
}: {
  completeAtDuration?: boolean
  currentTimeSeconds: number
  durationSeconds?: number | null
  previousTimeSeconds: number | null
}): PlaybackProgressAction => {
  if (!isValidTime(currentTimeSeconds)) {
    return 'ignored'
  }

  const duration = getValidDuration(durationSeconds)
  const previousTime = isValidTime(previousTimeSeconds) ? previousTimeSeconds : null
  const playbackHasMoved =
    currentTimeSeconds > PROGRESS_EPSILON_SECONDS ||
    (previousTime !== null && previousTime > PROGRESS_EPSILON_SECONDS)

  if (
    completeAtDuration &&
    duration !== null &&
    playbackHasMoved &&
    currentTimeSeconds >= Math.max(0, duration - END_EPSILON_SECONDS)
  ) {
    return 'ended'
  }

  if (previousTime === null) {
    return currentTimeSeconds > PROGRESS_EPSILON_SECONDS ? 'progressed' : 'ignored'
  }

  if (currentTimeSeconds > previousTime + PROGRESS_EPSILON_SECONDS) {
    return 'progressed'
  }

  const rewindDistance = previousTime - currentTimeSeconds
  if (rewindDistance <= REWIND_EPSILON_SECONDS) {
    return 'ignored'
  }

  const nearStart = currentTimeSeconds <= LOOP_START_WINDOW_SECONDS
  const nearKnownEnd =
    duration !== null &&
    previousTime >= Math.max(0, duration - LOOP_END_WINDOW_SECONDS)
  // Overlay players expose no seeking controls. A substantial reset to the
  // beginning is therefore a loop/restart even when the last progress sample
  // was too sparse to land inside the narrow known-end window.
  const likelyFullReset = previousTime >= LOOP_END_WINDOW_SECONDS

  if (nearStart && nearKnownEnd) {
    return 'ended'
  }

  if (nearStart && likelyFullReset) {
    return 'restarted'
  }

  return 'rewound'
}
