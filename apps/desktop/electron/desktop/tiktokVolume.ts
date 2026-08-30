import type { WebFrameMain } from 'electron'
import { TIKTOK_FALLBACK_VOLUME } from '../../shared/media.ts'
import type { TikTokVolumeApplicationResult } from '../../shared/preloadApi'

type TikTokPlayerFrame = Pick<
  WebFrameMain,
  'executeJavaScript' | 'isDestroyed' | 'url'
>

type InjectedVolumeResult = {
  appliedCount: number
  generation: number
  mediaCount: number
  mutedCount: number
  volume: number
}

type TikTokVolumeRetryOptions = {
  executeTimeoutMs?: number
  requestedDelays?: readonly number[]
  wait?: (delay: number) => Promise<void>
}

type VolumeAttemptStatus = 'applied' | 'rejected' | 'stale' | 'unavailable'
type VolumeAttemptResult = {
  rejectedFrames: TikTokPlayerFrame[]
  status: VolumeAttemptStatus
}

const TIKTOK_PLAYER_ORIGIN = 'https://www.tiktok.com'
const TIKTOK_PLAYER_PATH_PATTERN = /^\/player\/v1\/(\d{10,30})\/?$/
const VOLUME_EPSILON = 0.001
const DEFAULT_EXECUTE_TIMEOUT_MS = 750
const DEFAULT_REQUESTED_DELAYS = [0, 75, 200, 500, 1_000] as const
const waitFor = (delay: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })

const executeJavaScriptWithTimeout = (
  frame: TikTokPlayerFrame,
  script: string,
  timeoutMs: number,
) => new Promise<unknown>((resolve, reject) => {
  let settled = false
  const timeout = setTimeout(() => {
    settled = true
    resolve(undefined)
  }, timeoutMs)

  void frame.executeJavaScript(script).then(
    (result) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve(result)
    },
    (error: unknown) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      reject(error instanceof Error ? error : new Error('Injection TikTok impossible.'))
    },
  )
})

export const isTikTokPlayerFrameUrl = (value: string, videoId: string) => {
  try {
    const url = new URL(value)
    if (
      url.origin !== TIKTOK_PLAYER_ORIGIN ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return false
    }

    return url.pathname.match(TIKTOK_PLAYER_PATH_PATTERN)?.[1] === videoId
  } catch {
    return false
  }
}

const createVolumeControllerScript = (volume: number, generation: number) => {
  const normalizedVolume = volume / 100

  return `(() => {
    const controllerKey = Symbol.for('memedrop.tiktok-volume-controller.v2');
    const requestedVolume = ${JSON.stringify(normalizedVolume)};
    const requestedGeneration = ${JSON.stringify(generation)};
    let controller = globalThis[controllerKey];

    if (
      !controller ||
      controller.version !== 2 ||
      typeof controller.apply !== 'function' ||
      typeof controller.setVolume !== 'function'
    ) {
      controller = {
        version: 2,
        generation: requestedGeneration,
        volume: requestedVolume,
        observer: null,
        applyTo(media) {
          try {
            if (Math.abs(media.volume - this.volume) > ${VOLUME_EPSILON}) {
              media.volume = this.volume;
            }
            const shouldBeMuted = this.volume <= ${VOLUME_EPSILON};
            if (media.muted !== shouldBeMuted) {
              media.muted = shouldBeMuted;
            }
            return (
              Math.abs(media.volume - this.volume) <= ${VOLUME_EPSILON} &&
              media.muted === shouldBeMuted
            );
          } catch {
            return false;
          }
        },
        apply() {
          const mediaElements = Array.from(document.querySelectorAll('video, audio'));
          let appliedCount = 0;
          let mutedCount = 0;
          for (const media of mediaElements) {
            if (media instanceof HTMLMediaElement) {
              if (this.applyTo(media)) {
                appliedCount += 1;
              }
              if (media.muted) {
                mutedCount += 1;
              }
            }
          }
          return {
            appliedCount,
            generation: this.generation,
            mediaCount: mediaElements.length,
            mutedCount,
            volume: this.volume,
          };
        },
        setVolume(nextVolume, nextGeneration) {
          if (nextGeneration < this.generation) {
            return false;
          }
          this.generation = nextGeneration;
          this.volume = nextVolume;
          return true;
        },
      };

      const enforceVolume = (event) => {
        if (event.target instanceof HTMLMediaElement) {
          controller.applyTo(event.target);
        }
      };
      document.addEventListener('loadedmetadata', enforceVolume, true);
      document.addEventListener('play', enforceVolume, true);
      document.addEventListener('volumechange', enforceVolume, true);

      if (document.documentElement) {
        controller.observer = new MutationObserver(() => controller.apply());
        controller.observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      }

      globalThis[controllerKey] = controller;
    }

    controller.setVolume(requestedVolume, requestedGeneration);
    return controller.apply();
  })()`
}

const inspectInjectedVolumeResult = (
  value: unknown,
  expectedVolume: number,
  expectedGeneration: number,
): VolumeAttemptStatus => {
  if (!value || typeof value !== 'object') {
    return 'unavailable'
  }

  const result = value as Partial<InjectedVolumeResult>
  if (
    typeof result.generation === 'number' &&
    Number.isSafeInteger(result.generation) &&
    result.generation > expectedGeneration
  ) {
    return 'stale'
  }

  if (
    result.generation !== expectedGeneration ||
    typeof result.mediaCount !== 'number' ||
    !Number.isSafeInteger(result.mediaCount) ||
    result.mediaCount <= 0
  ) {
    return 'unavailable'
  }

  const normalizedExpectedVolume = expectedVolume / 100
  const applied = (
    typeof result.appliedCount === 'number' &&
    Number.isSafeInteger(result.appliedCount) &&
    result.appliedCount === result.mediaCount &&
    typeof result.mutedCount === 'number' &&
    Number.isSafeInteger(result.mutedCount) &&
    result.mutedCount === (expectedVolume === 0 ? result.mediaCount : 0) &&
    typeof result.volume === 'number' &&
    Number.isFinite(result.volume) &&
    Math.abs(result.volume - normalizedExpectedVolume) <= VOLUME_EPSILON
  )

  return applied ? 'applied' : 'rejected'
}

const applyVolumeToFrames = async (
  frames: readonly TikTokPlayerFrame[],
  videoId: string,
  volume: number,
  generation: number,
  executeTimeoutMs: number,
): Promise<VolumeAttemptResult> => {
  const script = createVolumeControllerScript(volume, generation)
  const rejectedFrames: TikTokPlayerFrame[] = []
  for (const frame of frames) {
    if (frame.isDestroyed() || !isTikTokPlayerFrameUrl(frame.url, videoId)) {
      continue
    }

    try {
      const result = await executeJavaScriptWithTimeout(frame, script, executeTimeoutMs)
      const status = inspectInjectedVolumeResult(result, volume, generation)
      if (status === 'applied' || status === 'stale') {
        return { rejectedFrames: [], status }
      }
      if (status === 'rejected') {
        rejectedFrames.push(frame)
      }
    } catch {
      // Le garde audio du processus principal reste muet sans frame contrôlable.
    }
  }

  return {
    rejectedFrames,
    status: rejectedFrames.length > 0 ? 'rejected' : 'unavailable',
  }
}

export const applyTikTokPlayerVolume = async (
  getFrames: () => readonly TikTokPlayerFrame[],
  videoId: string,
  requestedVolume: number,
  generation: number,
  options: TikTokVolumeRetryOptions = {},
): Promise<TikTokVolumeApplicationResult> => {
  const wait = options.wait ?? waitFor
  const executeTimeoutMs =
    typeof options.executeTimeoutMs === 'number' &&
    Number.isFinite(options.executeTimeoutMs) &&
    options.executeTimeoutMs >= 0
      ? options.executeTimeoutMs
      : DEFAULT_EXECUTE_TIMEOUT_MS
  for (const delay of options.requestedDelays ?? DEFAULT_REQUESTED_DELAYS) {
    if (delay > 0) {
      await wait(delay)
    }

    const requestedAttempt = await applyVolumeToFrames(
      getFrames(),
      videoId,
      requestedVolume,
      generation,
      executeTimeoutMs,
    )
    if (requestedAttempt.status === 'applied') {
      return {
        applied: true,
        effectiveVolume: requestedVolume,
        usedFallback: false,
      }
    }
    if (requestedAttempt.status === 'stale') {
      break
    }

    if (
      requestedAttempt.status === 'rejected' &&
      requestedVolume > 0 &&
      requestedVolume !== TIKTOK_FALLBACK_VOLUME
    ) {
      const fallbackAttempt = await applyVolumeToFrames(
        requestedAttempt.rejectedFrames,
        videoId,
        TIKTOK_FALLBACK_VOLUME,
        generation,
        executeTimeoutMs,
      )
      if (fallbackAttempt.status === 'applied') {
        return {
          applied: true,
          effectiveVolume: TIKTOK_FALLBACK_VOLUME,
          usedFallback: true,
        }
      }
      if (fallbackAttempt.status === 'stale') {
        break
      }
    }
  }

  return {
    applied: false,
    effectiveVolume: null,
    usedFallback: false,
  }
}
