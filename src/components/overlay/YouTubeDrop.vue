<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import type { Drop } from '../../../shared/types'

type YouTubeMessage = Record<string, unknown>

const YOUTUBE_ORIGIN = 'https://www.youtube.com'
const YOUTUBE_PLAYER_STATE_ENDED = 0
const YOUTUBE_HANDSHAKE_INTERVAL_MS = 500
const YOUTUBE_EVENTS = ['onStateChange', 'onError', 'onAutoplayBlocked'] as const

const props = defineProps<{
  drop: Drop
  volume: number
  frameStyle: CSSProperties
}>()

const emit = defineEmits<{
  advance: [dropId?: string]
}>()

const youtubeIframe = ref<HTMLIFrameElement | null>(null)

let youtubeHandshakeTimer: number | undefined
let completedDropId: string | null = null

const normalizedDropVolume = computed(() => Math.min(Math.max(props.volume, 0), 100) / 100)
const youtubeIframeId = computed(() => `youtube-player-${props.drop.id}`)

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

const sendYouTubeMessage = (message: YouTubeMessage) => {
  youtubeIframe.value?.contentWindow?.postMessage(
    JSON.stringify(message),
    YOUTUBE_ORIGIN,
  )
}

const sendYouTubeCommand = (func: string, args: unknown[] = []) => {
  sendYouTubeMessage({ event: 'command', func, args })
}

const clearYouTubeHandshakeTimer = () => {
  if (youtubeHandshakeTimer) {
    window.clearInterval(youtubeHandshakeTimer)
    youtubeHandshakeTimer = undefined
  }
}

const applyDropVolume = () => {
  sendYouTubeCommand('setVolume', [Math.round(normalizedDropVolume.value * 100)])
}

const announceYouTubeListener = () => {
  sendYouTubeMessage({ event: 'listening', id: youtubeIframeId.value })
}

const configureYouTubePlayer = () => {
  YOUTUBE_EVENTS.forEach((eventName) => {
    sendYouTubeCommand('addEventListener', [eventName])
  })
  applyDropVolume()
  sendYouTubeCommand('playVideo')
}

const startYouTubeHandshake = () => {
  clearYouTubeHandshakeTimer()
  announceYouTubeListener()
  configureYouTubePlayer()
  youtubeHandshakeTimer = window.setInterval(
    announceYouTubeListener,
    YOUTUBE_HANDSHAKE_INTERVAL_MS,
  )
}

const advanceDrop = () => {
  const dropId = props.drop.id
  if (!dropId || completedDropId === dropId) {
    return
  }

  completedDropId = dropId
  clearYouTubeHandshakeTimer()
  emit('advance', dropId)
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

  if (message.event === 'infoDelivery' && isRecord(message.info)) {
    return typeof message.info.playerState === 'number' ? message.info.playerState : null
  }

  return null
}

const handleYouTubeLoad = () => {
  startYouTubeHandshake()
}

const handleYouTubeMessage = (event: MessageEvent) => {
  if (
    event.origin !== YOUTUBE_ORIGIN ||
    event.source !== youtubeIframe.value?.contentWindow
  ) {
    return
  }

  const message = parseYouTubeMessage(event.data)
  if (!message) {
    return
  }

  if (message.event === 'onError' || message.event === 'onAutoplayBlocked') {
    advanceDrop()
    return
  }

  if (getYouTubePlayerState(message) === YOUTUBE_PLAYER_STATE_ENDED) {
    advanceDrop()
    return
  }

  if (message.event === 'onReady' || message.event === 'initialDelivery') {
    clearYouTubeHandshakeTimer()
    configureYouTubePlayer()
  }
}

const handleYouTubeError = (event: Event) => {
  if (event.currentTarget === youtubeIframe.value) {
    advanceDrop()
  }
}

watch(
  () => props.volume,
  () => applyDropVolume(),
)

watch(
  () => props.drop.id,
  () => {
    clearYouTubeHandshakeTimer()
    completedDropId = null
  },
)

onMounted(() => {
  window.addEventListener('message', handleYouTubeMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleYouTubeMessage)
  clearYouTubeHandshakeTimer()
})
</script>

<template>
  <div
    class="mx-auto aspect-video w-full max-w-[calc(60vh*16/9)] overflow-hidden rounded-2xl bg-black"
    :style="frameStyle"
  >
    <iframe
      ref="youtubeIframe"
      :id="youtubeIframeId"
      :key="`youtube-${drop.id}`"
      :src="youtubeEmbedUrl"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
      class="h-full w-full border-0"
      referrerpolicy="strict-origin-when-cross-origin"
      sandbox="allow-presentation allow-same-origin allow-scripts"
      title="Vidéo YouTube MemeDrop"
      @error="handleYouTubeError"
      @load="handleYouTubeLoad"
    />
  </div>
</template>
