<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import type { Drop } from '../../../shared/types'

type TikTokPlayerMessage = {
  'x-tiktok-player': true
  type: string
  value?: unknown
}

const TIKTOK_PLAYER_ORIGIN = 'https://www.tiktok.com'
const TIKTOK_PLAYER_STATE_ENDED = 0
const TIKTOK_STARTUP_TIMEOUT_MS = 30_000
const TIKTOK_STALL_TIMEOUT_MS = 20_000

const props = defineProps<{
  drop: Drop
  volume: number
  frameStyle: CSSProperties
}>()

const emit = defineEmits<{
  advance: [dropId?: string]
}>()

const tiktokIframe = ref<HTMLIFrameElement | null>(null)
let tiktokWatchdogTimer: number | undefined
let completedDropId: string | null = null
let playerReadyDropId: string | null = null
let lastCurrentTime: number | null = null
let lastImageIndex: number | null = null

const normalizedDropVolume = computed(() => Math.min(Math.max(props.volume, 0), 100) / 100)

const tiktokEmbedUrl = computed(() => {
  if (!props.drop.tiktokVideoId || !/^\d{10,30}$/.test(props.drop.tiktokVideoId)) {
    return ''
  }

  const params = new URLSearchParams({
    autoplay: '1',
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
  if (tiktokWatchdogTimer) {
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
  emit('advance', expectedDropId)
}

const armTikTokWatchdog = (
  expectedDropId: string,
  delay = TIKTOK_STALL_TIMEOUT_MS,
) => {
  if (props.drop.id !== expectedDropId || completedDropId === expectedDropId) {
    return
  }

  clearTikTokWatchdog()
  tiktokWatchdogTimer = window.setTimeout(() => advanceDrop(expectedDropId), delay)
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

const applyDropVolume = () => {
  sendTikTokCommand(normalizedDropVolume.value <= 0 ? 'mute' : 'unMute')
}

const configureTikTokPlayer = (expectedDropId: string) => {
  applyDropVolume()
  sendTikTokCommand('play')
  armTikTokWatchdog(expectedDropId)
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
    typeof value.duration !== 'number' ||
    !Number.isFinite(value.duration)
  ) {
    return null
  }

  return value.currentTime
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
  if (!expectedDropId) {
    return
  }

  if (message.type === 'onPlayerError') {
    advanceDrop(expectedDropId)
    return
  }

  if (message.type === 'onStateChange') {
    if (message.value === TIKTOK_PLAYER_STATE_ENDED) {
      advanceDrop(expectedDropId)
    }
    return
  }

  if (message.type === 'onPlayerReady') {
    if (playerReadyDropId !== expectedDropId) {
      playerReadyDropId = expectedDropId
      configureTikTokPlayer(expectedDropId)
    }
    return
  }

  const currentTime = getTikTokCurrentTime(message)
  if (currentTime !== null) {
    const previousTime = lastCurrentTime
    if (previousTime === null) {
      lastCurrentTime = currentTime
      if (currentTime > 0) {
        armTikTokWatchdog(expectedDropId)
      }
    } else if (currentTime > previousTime + 0.05 || currentTime < previousTime - 0.5) {
      lastCurrentTime = currentTime
      armTikTokWatchdog(expectedDropId)
    }
    return
  }

  const imageIndex = getTikTokImageIndex(message)
  if (imageIndex !== null && imageIndex !== lastImageIndex) {
    lastImageIndex = imageIndex
    armTikTokWatchdog(expectedDropId)
  }
}

const handleTikTokLoad = (event: Event) => {
  const expectedDropId = (event.currentTarget as HTMLIFrameElement).dataset.dropId
  if (!expectedDropId) {
    return
  }

  applyDropVolume()
  sendTikTokCommand('play')
  armTikTokWatchdog(expectedDropId, TIKTOK_STARTUP_TIMEOUT_MS)
}

const handleTikTokError = (event: Event) => {
  const iframe = event.currentTarget as HTMLIFrameElement
  const expectedDropId = iframe.dataset.dropId
  if (iframe === tiktokIframe.value && expectedDropId) {
    advanceDrop(expectedDropId)
  }
}

const resetTikTokDrop = (dropId: string) => {
  clearTikTokWatchdog()
  completedDropId = null
  playerReadyDropId = null
  lastCurrentTime = null
  lastImageIndex = null

  if (!tiktokEmbedUrl.value) {
    window.queueMicrotask(() => advanceDrop(dropId))
    return
  }

  armTikTokWatchdog(dropId, TIKTOK_STARTUP_TIMEOUT_MS)
}

watch(
  () => props.volume,
  () => applyDropVolume(),
)

watch(
  () => props.drop.id,
  (dropId) => resetTikTokDrop(dropId),
)

onMounted(() => {
  window.addEventListener('message', handleTikTokMessage)
  resetTikTokDrop(props.drop.id)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleTikTokMessage)
  clearTikTokWatchdog()
})
</script>

<template>
  <div
    class="mx-auto flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-black"
    :style="frameStyle"
  >
    <iframe
      v-if="tiktokEmbedUrl"
      ref="tiktokIframe"
      :key="`tiktok-${drop.id}`"
      :data-drop-id="drop.id"
      :src="tiktokEmbedUrl"
      allow="autoplay; encrypted-media"
      class="h-full max-h-full aspect-9/16 border-0"
      referrerpolicy="strict-origin-when-cross-origin"
      sandbox="allow-same-origin allow-scripts"
      title="Vidéo TikTok MemeDrop"
      @error="handleTikTokError"
      @load="handleTikTokLoad"
    />
  </div>
</template>
