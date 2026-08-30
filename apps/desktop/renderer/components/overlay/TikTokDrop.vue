<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { TIKTOK_FALLBACK_VOLUME } from '../../../shared/media'
import type { Drop } from '../../../shared/types'
import {
  getTikTokPlaybackStateAction,
  getTikTokVolumeRetryDelay,
  shouldRequestTikTokPlayback,
  TIKTOK_AUTOPLAY_VALUE,
  TIKTOK_START_COMMANDS,
} from './tiktokPlayerPolicy'

type TikTokPlayerMessage = {
  'x-tiktok-player': true
  type: string
  value?: unknown
}

const TIKTOK_PLAYER_ORIGIN = 'https://www.tiktok.com'
const TIKTOK_PLAYER_ERROR_INVALID_VIDEO = 1001
const TIKTOK_PROGRESS_EPSILON_SECONDS = 0.05
const TIKTOK_STARTUP_TIMEOUT_MS = 30_000
const TIKTOK_STALL_TIMEOUT_MS = 20_000

const props = defineProps<{
  drop: Drop
  volume: number
  frameStyle: CSSProperties
}>()

const emit = defineEmits<{
  advance: [dropId?: string]
  loading: [dropId: string]
  ready: [dropId: string]
}>()

const tiktokIframe = ref<HTMLIFrameElement | null>(null)
const iframeRevision = ref(0)
const isPlayerReady = ref(false)
let tiktokWatchdogTimer: number | undefined
let tiktokWatchdogRevision = 0
let completedDropId: string | null = null
let playerReadyDropId: string | null = null
let playbackStartedDropId: string | null = null
let lastCurrentTime: number | null = null
let lastImageIndex: number | null = null
let retryCount = 0
let volumeApplicationRevision = 0
let volumeApplicationStartedKey: string | null = null
let volumeRetryAttempt = 0
let volumeRetryTimer: number | undefined

type TikTokFailureReason =
  | 'iframe-error'
  | 'player-error'
  | 'stall-timeout'
  | 'startup-timeout'

type TikTokWatchdogPhase = 'stall' | 'startup'

const requestedDropVolume = computed(() => {
  if (!Number.isFinite(props.volume)) {
    return TIKTOK_FALLBACK_VOLUME
  }

  return Math.round(Math.min(Math.max(props.volume, 0), 100))
})

const portraitFrameStyle = computed<CSSProperties>(() => {
  const configuredMaxWidth = props.frameStyle.maxWidth
  const maxWidth = typeof configuredMaxWidth === 'number'
    ? `${configuredMaxWidth}px`
    : configuredMaxWidth || '90vw'

  return {
    width: `min(calc(60vh * 9 / 16), ${maxWidth}, 90vw)`,
  }
})

const tiktokEmbedUrl = computed(() => {
  if (!props.drop.tiktokVideoId || !/^\d{10,30}$/.test(props.drop.tiktokVideoId)) {
    return ''
  }

  const params = new URLSearchParams({
    autoplay: TIKTOK_AUTOPLAY_VALUE,
    closed_caption: '0',
    controls: '0',
    description: '0',
    loop: '0',
    music_info: '0',
    native_context_menu: '0',
    rel: '0',
  })

  return `${TIKTOK_PLAYER_ORIGIN}/player/v1/${props.drop.tiktokVideoId}?${params.toString()}`
})

const clearTikTokWatchdog = () => {
  tiktokWatchdogRevision += 1
  if (tiktokWatchdogTimer !== undefined) {
    window.clearTimeout(tiktokWatchdogTimer)
    tiktokWatchdogTimer = undefined
  }
}

const advanceDrop = (expectedDropId: string) => {
  if (props.drop.id !== expectedDropId || completedDropId === expectedDropId) {
    return
  }

  completedDropId = expectedDropId
  clearTikTokWatchdog()
  clearTikTokVolumeRetry()
  emit('advance', expectedDropId)
}

function armTikTokWatchdog(expectedDropId: string, phase: TikTokWatchdogPhase) {
  if (props.drop.id !== expectedDropId || completedDropId === expectedDropId) {
    return
  }

  clearTikTokWatchdog()
  const delay = phase === 'startup' ? TIKTOK_STARTUP_TIMEOUT_MS : TIKTOK_STALL_TIMEOUT_MS
  const expectedAttempt = iframeRevision.value
  const expectedWatchdogRevision = tiktokWatchdogRevision
  tiktokWatchdogTimer = window.setTimeout(
    () => {
      if (
        iframeRevision.value !== expectedAttempt ||
        tiktokWatchdogRevision !== expectedWatchdogRevision
      ) {
        return
      }

      tiktokWatchdogTimer = undefined
      tiktokWatchdogRevision += 1
      handleTikTokFailure(expectedDropId, `${phase}-timeout`)
    },
    delay,
  )
}

function retryTikTokPlayer(expectedDropId: string) {
  if (
    props.drop.id !== expectedDropId ||
    completedDropId === expectedDropId ||
    playbackStartedDropId === expectedDropId ||
    retryCount >= 1
  ) {
    return false
  }

  retryCount += 1
  playerReadyDropId = null
  isPlayerReady.value = false
  emit('loading', expectedDropId)
  lastCurrentTime = null
  lastImageIndex = null
  volumeApplicationRevision += 1
  volumeApplicationStartedKey = null
  clearTikTokVolumeRetry()
  iframeRevision.value += 1
  armTikTokWatchdog(expectedDropId, 'startup')
  return true
}

function handleTikTokFailure(
  expectedDropId: string,
  reason: TikTokFailureReason,
  errorCode: number | null = null,
) {
  if (props.drop.id !== expectedDropId || completedDropId === expectedDropId) {
    return
  }

  const failedAttempt = iframeRevision.value + 1
  const isPermanentPlayerError =
    reason === 'player-error' && errorCode === TIKTOK_PLAYER_ERROR_INVALID_VIDEO
  const retrying = !isPermanentPlayerError && retryTikTokPlayer(expectedDropId)
  console.warn('Lecteur TikTok indisponible.', {
    action: retrying ? 'retry' : 'advance',
    attempt: failedAttempt,
    errorCode,
    reason,
  })

  if (!retrying) {
    advanceDrop(expectedDropId)
  }
}

const sendTikTokCommand = (type: 'play' | 'pause' | 'mute' | 'unMute') => {
  tiktokIframe.value?.contentWindow?.postMessage(
    {
      'x-tiktok-player': true,
      type,
    },
    TIKTOK_PLAYER_ORIGIN,
  )
}

const getPlayerKey = (dropId: string, attempt: number) => `${dropId}:${attempt}`

const isCurrentPlayer = (dropId: string, attempt: number) =>
  props.drop.id === dropId &&
  iframeRevision.value === attempt &&
  completedDropId !== dropId

function clearTikTokVolumeRetry(resetAttempt = true) {
  if (volumeRetryTimer !== undefined) {
    window.clearTimeout(volumeRetryTimer)
    volumeRetryTimer = undefined
  }
  if (resetAttempt) {
    volumeRetryAttempt = 0
  }
}

function scheduleTikTokVolumeRetry(expectedDropId: string, expectedAttempt: number) {
  if (
    requestedDropVolume.value === 0 ||
    playbackStartedDropId !== expectedDropId ||
    !isCurrentPlayer(expectedDropId, expectedAttempt) ||
    volumeRetryTimer !== undefined
  ) {
    return
  }

  const delay = getTikTokVolumeRetryDelay(volumeRetryAttempt)
  volumeRetryAttempt += 1
  volumeRetryTimer = window.setTimeout(() => {
    volumeRetryTimer = undefined
    void applyDropVolume(expectedDropId, expectedAttempt)
  }, delay)
}

const applyDropVolume = async (expectedDropId: string, expectedAttempt: number) => {
  const applicationRevision = ++volumeApplicationRevision
  const requestedVolume = requestedDropVolume.value

  // TikTok ne sait officiellement que couper ou rétablir le son. Le lecteur
  // reste donc muet tant que le volume continu n'a pas été confirmé côté main.
  sendTikTokCommand('mute')

  const videoId = props.drop.tiktokVideoId
  const bridge = window.memedropOverlay
  if (
    !videoId ||
    !bridge ||
    playbackStartedDropId !== expectedDropId ||
    !isCurrentPlayer(expectedDropId, expectedAttempt)
  ) {
    return false
  }

  try {
    const result = await bridge.applyTikTokVolume(
      expectedDropId,
      videoId,
      requestedVolume,
    )
    if (
      applicationRevision !== volumeApplicationRevision ||
      !isCurrentPlayer(expectedDropId, expectedAttempt)
    ) {
      return false
    }

    if (!result.applied || result.effectiveVolume === null) {
      sendTikTokCommand('mute')
      scheduleTikTokVolumeRetry(expectedDropId, expectedAttempt)
      return false
    }

    clearTikTokVolumeRetry()
    if (result.usedFallback) {
      console.warn('Volume TikTok utilisateur indisponible ; fallback appliqué.', {
        effectiveVolume: result.effectiveVolume,
        requestedVolume,
      })
    }
    return true
  } catch (error) {
    if (
      applicationRevision === volumeApplicationRevision &&
      isCurrentPlayer(expectedDropId, expectedAttempt)
    ) {
      sendTikTokCommand('mute')
      scheduleTikTokVolumeRetry(expectedDropId, expectedAttempt)
      console.warn('Contrôle du volume TikTok indisponible ; lecteur maintenu muet.', error)
    }
    return false
  }
}

const startTikTokPlayer = (expectedDropId: string, expectedAttempt: number) => {
  if (
    !isCurrentPlayer(expectedDropId, expectedAttempt) ||
    !shouldRequestTikTokPlayback(playbackStartedDropId === expectedDropId)
  ) {
    return
  }

  // Le démarrage ne doit jamais dépendre du shim de volume. La sortie audio
  // globale est déjà coupée dans le processus principal avant l'affichage.
  for (const command of TIKTOK_START_COMMANDS) {
    sendTikTokCommand(command)
  }
}

const applyInitialTikTokVolume = (expectedDropId: string, expectedAttempt: number) => {
  const playerKey = getPlayerKey(expectedDropId, expectedAttempt)
  if (
    playbackStartedDropId !== expectedDropId ||
    volumeApplicationStartedKey === playerKey
  ) {
    return
  }

  volumeApplicationStartedKey = playerKey
  void applyDropVolume(expectedDropId, expectedAttempt)
}

const isTikTokPlayerMessage = (value: unknown): value is TikTokPlayerMessage => {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as Partial<TikTokPlayerMessage>)['x-tiktok-player'] === true &&
      typeof (value as Partial<TikTokPlayerMessage>).type === 'string',
  )
}

const getTikTokCurrentTime = (message: TikTokPlayerMessage) => {
  if (
    message.type !== 'onCurrentTime' ||
    !message.value ||
    typeof message.value !== 'object'
  ) {
    return null
  }

  const value = message.value as Record<string, unknown>
  if (
    typeof value.currentTime !== 'number' ||
    !Number.isFinite(value.currentTime) ||
    value.currentTime < 0 ||
    typeof value.duration !== 'number' ||
    !Number.isFinite(value.duration) ||
    value.duration < 0
  ) {
    return null
  }

  return value.currentTime
}

const getTikTokPlayerErrorCode = (message: TikTokPlayerMessage) => {
  if (typeof message.value === 'number' && Number.isFinite(message.value)) {
    return message.value
  }

  if (!message.value || typeof message.value !== 'object') {
    return null
  }

  const value = message.value as Record<string, unknown>
  for (const key of ['code', 'errorCode']) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) {
      return value[key] as number
    }
  }

  return null
}

const getTikTokImageIndex = (message: TikTokPlayerMessage) => {
  if (message.type !== 'onImageChange') {
    return null
  }

  if (typeof message.value === 'number' && Number.isFinite(message.value)) {
    return message.value
  }

  if (!message.value || typeof message.value !== 'object') {
    return null
  }

  const value = message.value as Record<string, unknown>
  for (const key of ['currentImage', 'currentImageIndex', 'imageIndex', 'index']) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) {
      return value[key] as number
    }
  }

  return null
}

const markTikTokPlayerReady = (expectedDropId: string, expectedAttempt: number) => {
  if (
    playerReadyDropId === expectedDropId ||
    !isCurrentPlayer(expectedDropId, expectedAttempt)
  ) {
    return
  }

  playerReadyDropId = expectedDropId
  isPlayerReady.value = true
  emit('ready', expectedDropId)
}

const markTikTokPlaybackStarted = (expectedDropId: string, expectedAttempt: number) => {
  if (!isCurrentPlayer(expectedDropId, expectedAttempt)) {
    return
  }

  playbackStartedDropId = expectedDropId
  markTikTokPlayerReady(expectedDropId, expectedAttempt)
  armTikTokWatchdog(expectedDropId, 'stall')
  applyInitialTikTokVolume(expectedDropId, expectedAttempt)
}

const handleTikTokMessage = (event: MessageEvent) => {
  if (
    event.origin !== TIKTOK_PLAYER_ORIGIN ||
    event.source !== tiktokIframe.value?.contentWindow ||
    !isTikTokPlayerMessage(event.data)
  ) {
    return
  }

  const message = event.data
  const expectedDropId = tiktokIframe.value.dataset.dropId
  const expectedAttempt = tiktokIframe.value.dataset.attempt
  if (
    !expectedDropId ||
    completedDropId === expectedDropId ||
    expectedAttempt !== String(iframeRevision.value)
  ) {
    return
  }

  if (message.type === 'onPlayerError') {
    handleTikTokFailure(expectedDropId, 'player-error', getTikTokPlayerErrorCode(message))
    return
  }

  if (message.type === 'onStateChange') {
    const action = getTikTokPlaybackStateAction(
      message.value,
      playbackStartedDropId === expectedDropId,
    )
    if (action === 'ended') {
      advanceDrop(expectedDropId)
    }
    if (action === 'started') {
      markTikTokPlaybackStarted(expectedDropId, iframeRevision.value)
    }
    return
  }

  if (message.type === 'onPlayerReady') {
    markTikTokPlayerReady(expectedDropId, iframeRevision.value)
    startTikTokPlayer(expectedDropId, iframeRevision.value)
    return
  }

  const currentTime = getTikTokCurrentTime(message)
  if (currentTime !== null) {
    const previousTime = lastCurrentTime
    if (previousTime === null) {
      lastCurrentTime = currentTime
      if (currentTime > TIKTOK_PROGRESS_EPSILON_SECONDS) {
        markTikTokPlaybackStarted(expectedDropId, iframeRevision.value)
      }
    } else if (
      currentTime > previousTime + TIKTOK_PROGRESS_EPSILON_SECONDS ||
      currentTime < previousTime - 0.5
    ) {
      lastCurrentTime = currentTime
      markTikTokPlaybackStarted(expectedDropId, iframeRevision.value)
    }
    return
  }

  const imageIndex = getTikTokImageIndex(message)
  if (imageIndex !== null && lastImageIndex === null) {
    lastImageIndex = imageIndex
  } else if (imageIndex !== null && imageIndex !== lastImageIndex) {
    lastImageIndex = imageIndex
    markTikTokPlaybackStarted(expectedDropId, iframeRevision.value)
  }
}

const handleTikTokLoad = (event: Event) => {
  const iframe = event.currentTarget as HTMLIFrameElement
  const expectedDropId = iframe.dataset.dropId
  if (
    iframe !== tiktokIframe.value ||
    !expectedDropId ||
    completedDropId === expectedDropId ||
    iframe.dataset.attempt !== String(iframeRevision.value)
  ) {
    return
  }

  startTikTokPlayer(expectedDropId, iframeRevision.value)
}

const handleTikTokError = (event: Event) => {
  const iframe = event.currentTarget as HTMLIFrameElement
  const expectedDropId = iframe.dataset.dropId
  if (
    iframe === tiktokIframe.value &&
    expectedDropId &&
    iframe.dataset.attempt === String(iframeRevision.value)
  ) {
    handleTikTokFailure(expectedDropId, 'iframe-error')
  }
}

const resetTikTokDrop = (dropId: string) => {
  clearTikTokWatchdog()
  completedDropId = null
  playerReadyDropId = null
  isPlayerReady.value = false
  emit('loading', dropId)
  playbackStartedDropId = null
  lastCurrentTime = null
  lastImageIndex = null
  retryCount = 0
  iframeRevision.value = 0
  volumeApplicationRevision += 1
  volumeApplicationStartedKey = null
  clearTikTokVolumeRetry()

  if (!tiktokEmbedUrl.value) {
    window.queueMicrotask(() => advanceDrop(dropId))
    return
  }

  armTikTokWatchdog(dropId, 'startup')
}

watch(
  () => props.volume,
  () => {
    if (completedDropId !== props.drop.id) {
      sendTikTokCommand('mute')
      clearTikTokVolumeRetry()
      if (playbackStartedDropId !== props.drop.id) {
        return
      }

      volumeApplicationStartedKey = getPlayerKey(props.drop.id, iframeRevision.value)
      void applyDropVolume(props.drop.id, iframeRevision.value)
    }
  },
)

watch(
  () => props.drop.id,
  (dropId, previousDropId) => {
    if (previousDropId) {
      void window.memedropOverlay?.releaseTikTokAudio(previousDropId).catch((error) => {
        console.warn('Libération du contrôle audio TikTok impossible.', error)
      })
    }
    resetTikTokDrop(dropId)
  },
)

onMounted(() => {
  window.addEventListener('message', handleTikTokMessage)
  resetTikTokDrop(props.drop.id)
})

onBeforeUnmount(() => {
  volumeApplicationRevision += 1
  clearTikTokVolumeRetry()
  window.removeEventListener('message', handleTikTokMessage)
  clearTikTokWatchdog()
})

onUnmounted(() => {
  void window.memedropOverlay?.releaseTikTokAudio(props.drop.id).catch((error) => {
    console.warn('Libération du contrôle audio TikTok impossible.', error)
  })
})
</script>

<template>
  <div
    class="relative mx-auto aspect-9/16 overflow-hidden rounded-2xl bg-black"
    :style="portraitFrameStyle"
  >
    <iframe
      v-if="tiktokEmbedUrl"
      ref="tiktokIframe"
      :key="`tiktok-${drop.id}-${iframeRevision}`"
      :data-attempt="iframeRevision"
      :data-drop-id="drop.id"
      :src="tiktokEmbedUrl"
      allow="autoplay; encrypted-media"
      class="absolute inset-0 h-full w-full border-0 transition-opacity duration-200 motion-reduce:transition-none"
      :class="isPlayerReady ? 'opacity-100' : 'opacity-0'"
      referrerpolicy="strict-origin-when-cross-origin"
      sandbox="allow-same-origin allow-scripts"
      title="Vidéo TikTok MemeDrop"
      @error="handleTikTokError"
      @load="handleTikTokLoad"
    />
  </div>
</template>
