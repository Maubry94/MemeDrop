<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import type { Drop } from '../../../shared/types'

type YouTubeMessage = Record<string, unknown>
type YouTubeIdentity = {
  dropId: string
  generation: number
}

const YOUTUBE_ORIGIN = 'https://www.youtube.com'
const YOUTUBE_PLAYER_STATE_ENDED = 0
const YOUTUBE_HANDSHAKE_INTERVAL_MS = 500
const YOUTUBE_LOAD_TIMEOUT_MS = 45_000
const YOUTUBE_STALL_TIMEOUT_MS = 30_000
const YOUTUBE_PROGRESS_EPSILON_SECONDS = 0.05
const YOUTUBE_EVENTS = ['onStateChange', 'onError', 'onAutoplayBlocked'] as const

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

const youtubeIframe = ref<HTMLIFrameElement | null>(null)
const iframeGeneration = ref(0)
const isPlayerReady = ref(false)

let youtubeHandshakeTimer: number | undefined
let youtubeHandshakeRevision = 0
let youtubeWatchdogTimer: number | undefined
let youtubeWatchdogRevision = 0
let completedGeneration: number | null = null
let playerReadyGeneration: number | null = null
let playbackStartedGeneration: number | null = null
let lastCurrentTime: number | null = null

const normalizedDropVolume = computed(() => Math.min(Math.max(props.volume, 0), 100) / 100)
const youtubeIframeId = computed(
  () => `youtube-player-${props.drop.id}-${iframeGeneration.value}`,
)

const youtubeEmbedUrl = computed(() => {
  if (!props.drop.youtubeVideoId) {
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
    origin: window.location.origin,
    playsinline: '1',
    rel: '0',
  })

  return `${YOUTUBE_ORIGIN}/embed/${encodeURIComponent(props.drop.youtubeVideoId)}?${params.toString()}`
})

const clearYouTubeHandshakeTimer = () => {
  youtubeHandshakeRevision += 1
  if (youtubeHandshakeTimer !== undefined) {
    window.clearInterval(youtubeHandshakeTimer)
    youtubeHandshakeTimer = undefined
  }
}

const clearYouTubeWatchdog = () => {
  youtubeWatchdogRevision += 1
  if (youtubeWatchdogTimer !== undefined) {
    window.clearTimeout(youtubeWatchdogTimer)
    youtubeWatchdogTimer = undefined
  }
}

const isCurrentIdentity = ({ dropId, generation }: YouTubeIdentity) =>
  props.drop.id === dropId &&
  iframeGeneration.value === generation &&
  completedGeneration !== generation

const getIframeIdentity = (iframe: HTMLIFrameElement): YouTubeIdentity | null => {
  const dropId = iframe.dataset.dropId
  const generation = Number(iframe.dataset.generation)
  if (!dropId || !Number.isSafeInteger(generation)) {
    return null
  }

  const identity = { dropId, generation }
  return isCurrentIdentity(identity) ? identity : null
}

const sendYouTubeMessage = (identity: YouTubeIdentity, message: YouTubeMessage) => {
  const iframe = youtubeIframe.value
  if (!iframe || !isCurrentIdentity(identity) || getIframeIdentity(iframe) === null) {
    return
  }

  iframe.contentWindow?.postMessage(JSON.stringify(message), YOUTUBE_ORIGIN)
}

const sendYouTubeCommand = (
  identity: YouTubeIdentity,
  func: string,
  args: unknown[] = [],
) => {
  sendYouTubeMessage(identity, { event: 'command', func, args })
}

const applyDropVolume = (identity: YouTubeIdentity) => {
  sendYouTubeCommand(identity, 'setVolume', [Math.round(normalizedDropVolume.value * 100)])
}

const announceYouTubeListener = (identity: YouTubeIdentity) => {
  sendYouTubeMessage(identity, { event: 'listening', id: youtubeIframeId.value })
}

const configureYouTubePlayer = (identity: YouTubeIdentity) => {
  YOUTUBE_EVENTS.forEach((eventName) => {
    sendYouTubeCommand(identity, 'addEventListener', [eventName])
  })
  applyDropVolume(identity)
  sendYouTubeCommand(identity, 'playVideo')
}

const startYouTubeHandshake = (identity: YouTubeIdentity) => {
  if (!isCurrentIdentity(identity)) {
    return
  }

  clearYouTubeHandshakeTimer()
  announceYouTubeListener(identity)
  configureYouTubePlayer(identity)
  const expectedHandshakeRevision = youtubeHandshakeRevision
  youtubeHandshakeTimer = window.setInterval(() => {
    if (
      !isCurrentIdentity(identity) ||
      youtubeHandshakeRevision !== expectedHandshakeRevision
    ) {
      return
    }

    announceYouTubeListener(identity)
  }, YOUTUBE_HANDSHAKE_INTERVAL_MS)
}

const advanceDrop = (identity: YouTubeIdentity) => {
  if (!isCurrentIdentity(identity)) {
    return
  }

  completedGeneration = identity.generation
  clearYouTubeHandshakeTimer()
  clearYouTubeWatchdog()
  emit('advance', identity.dropId)
}

const armYouTubeWatchdog = (
  identity: YouTubeIdentity,
  phase: 'load' | 'stall',
) => {
  if (!isCurrentIdentity(identity)) {
    return
  }

  clearYouTubeWatchdog()
  const expectedWatchdogRevision = youtubeWatchdogRevision
  const delay = phase === 'load' ? YOUTUBE_LOAD_TIMEOUT_MS : YOUTUBE_STALL_TIMEOUT_MS
  youtubeWatchdogTimer = window.setTimeout(() => {
    if (
      !isCurrentIdentity(identity) ||
      youtubeWatchdogRevision !== expectedWatchdogRevision
    ) {
      return
    }

    youtubeWatchdogTimer = undefined
    youtubeWatchdogRevision += 1
    console.warn('Lecteur YouTube indisponible.', {
      ...identity,
      reason: `${phase}-timeout`,
    })
    advanceDrop(identity)
  }, delay)
}

const markYouTubeProgress = (identity: YouTubeIdentity) => {
  if (!isCurrentIdentity(identity)) {
    return
  }

  playbackStartedGeneration = identity.generation
  armYouTubeWatchdog(identity, 'stall')
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const parseYouTubeMessage = (value: unknown): YouTubeMessage | null => {
  try {
    const message = typeof value === 'string' ? JSON.parse(value) : value
    return isRecord(message) ? message : null
  } catch {
    return null
  }
}

const getYouTubePlayerState = (message: YouTubeMessage) => {
  if (message.event === 'onStateChange') {
    const state = typeof message.info === 'number' ? message.info : message.data
    return typeof state === 'number' ? state : null
  }

  if (
    (message.event === 'infoDelivery' || message.event === 'initialDelivery') &&
    isRecord(message.info)
  ) {
    return typeof message.info.playerState === 'number' ? message.info.playerState : null
  }

  return null
}

const getYouTubeCurrentTime = (message: YouTubeMessage) => {
  if (
    (message.event !== 'infoDelivery' && message.event !== 'initialDelivery') ||
    !isRecord(message.info)
  ) {
    return null
  }

  const currentTime = message.info.currentTime
  return typeof currentTime === 'number' && Number.isFinite(currentTime) && currentTime >= 0
    ? currentTime
    : null
}

const handleYouTubeProgress = (identity: YouTubeIdentity, currentTime: number) => {
  const previousTime = lastCurrentTime
  if (previousTime === null) {
    lastCurrentTime = currentTime
    if (currentTime > YOUTUBE_PROGRESS_EPSILON_SECONDS) {
      markYouTubeProgress(identity)
    }
    return
  }

  if (
    currentTime > previousTime + YOUTUBE_PROGRESS_EPSILON_SECONDS ||
    currentTime < previousTime - 0.5
  ) {
    lastCurrentTime = currentTime
    markYouTubeProgress(identity)
  }
}

const handleYouTubeLoad = (event: Event) => {
  const iframe = event.currentTarget as HTMLIFrameElement
  if (iframe !== youtubeIframe.value) {
    return
  }

  const identity = getIframeIdentity(iframe)
  if (identity) {
    startYouTubeHandshake(identity)
  }
}

const handleYouTubeMessage = (event: MessageEvent) => {
  const iframe = youtubeIframe.value
  if (
    event.origin !== YOUTUBE_ORIGIN ||
    !iframe ||
    event.source !== iframe.contentWindow
  ) {
    return
  }

  const identity = getIframeIdentity(iframe)
  if (!identity) {
    return
  }

  const message = parseYouTubeMessage(event.data)
  if (!message) {
    return
  }

  if (message.event === 'onError' || message.event === 'onAutoplayBlocked') {
    advanceDrop(identity)
    return
  }

  if (
    getYouTubePlayerState(message) === YOUTUBE_PLAYER_STATE_ENDED &&
    playbackStartedGeneration === identity.generation
  ) {
    advanceDrop(identity)
    return
  }

  if (message.event === 'onReady' || message.event === 'initialDelivery') {
    clearYouTubeHandshakeTimer()
    if (playerReadyGeneration !== identity.generation) {
      playerReadyGeneration = identity.generation
      configureYouTubePlayer(identity)
      isPlayerReady.value = true
      emit('ready', identity.dropId)
    }
  }

  const currentTime = getYouTubeCurrentTime(message)
  if (currentTime !== null) {
    handleYouTubeProgress(identity, currentTime)
  }
}

const handleYouTubeError = (event: Event) => {
  const iframe = event.currentTarget as HTMLIFrameElement
  if (iframe !== youtubeIframe.value) {
    return
  }

  const identity = getIframeIdentity(iframe)
  if (identity) {
    advanceDrop(identity)
  }
}

const resetYouTubeDrop = () => {
  clearYouTubeHandshakeTimer()
  clearYouTubeWatchdog()
  iframeGeneration.value += 1
  isPlayerReady.value = false
  emit('loading', props.drop.id)
  completedGeneration = null
  playerReadyGeneration = null
  playbackStartedGeneration = null
  lastCurrentTime = null

  const identity = {
    dropId: props.drop.id,
    generation: iframeGeneration.value,
  }
  if (!youtubeEmbedUrl.value) {
    window.queueMicrotask(() => advanceDrop(identity))
    return
  }

  armYouTubeWatchdog(identity, 'load')
}

watch(
  () => [props.drop.id, props.drop.youtubeVideoId] as const,
  () => resetYouTubeDrop(),
  { immediate: true },
)

watch(
  () => props.volume,
  () => {
    const identity = {
      dropId: props.drop.id,
      generation: iframeGeneration.value,
    }
    if (isCurrentIdentity(identity)) {
      applyDropVolume(identity)
    }
  },
)

onMounted(() => {
  window.addEventListener('message', handleYouTubeMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleYouTubeMessage)
  clearYouTubeHandshakeTimer()
  clearYouTubeWatchdog()
})
</script>

<template>
  <div
    class="relative mx-auto aspect-video w-full max-w-[calc(60vh*16/9)] overflow-hidden rounded-2xl bg-black"
    :style="frameStyle"
  >
    <iframe
      v-if="youtubeEmbedUrl"
      ref="youtubeIframe"
      :id="youtubeIframeId"
      :key="`youtube-${drop.id}-${iframeGeneration}`"
      :data-drop-id="drop.id"
      :data-generation="iframeGeneration"
      :src="youtubeEmbedUrl"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
      class="absolute inset-0 h-full w-full border-0 transition-opacity duration-200 motion-reduce:transition-none"
      :class="isPlayerReady ? 'opacity-100' : 'opacity-0'"
      referrerpolicy="strict-origin-when-cross-origin"
      sandbox="allow-presentation allow-same-origin allow-scripts"
      title="Vidéo YouTube MemeDrop"
      @error="handleYouTubeError"
      @load="handleYouTubeLoad"
    />
  </div>
</template>
