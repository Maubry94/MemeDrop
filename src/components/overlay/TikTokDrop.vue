<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import type { Drop } from '../../../shared/types'

type TikTokPlayerMessage =
  | {
      'x-tiktok-player': true
      type: 'onPlayerReady'
      value?: undefined
    }
  | {
      'x-tiktok-player': true
      type: 'onStateChange'
      value: number
    }
  | {
      'x-tiktok-player': true
      type: 'onPlayerError'
      value?: unknown
    }
  | {
      'x-tiktok-player': true
      type: string
      value?: unknown
    }

const TIKTOK_PLAYER_STATE_ENDED = 0

type TikTokWebviewElement = HTMLElement & {
  executeJavaScript: (code: string) => Promise<unknown>
  send: (channel: string, ...args: unknown[]) => void
}

type TikTokIpcMessageEvent = Event & {
  channel: string
  args: unknown[]
}

const props = defineProps<{
  drop: Drop
  volume: number
  frameStyle: CSSProperties
}>()

const emit = defineEmits<{
  advance: [dropId?: string]
}>()

const tiktokWebview = ref<TikTokWebviewElement | null>(null)
const tiktokPreloadUrl = ref('')

const normalizedDropVolume = computed(() => Math.min(Math.max(props.volume, 0), 100) / 100)

const tiktokEmbedUrl = computed(() => {
  if (!props.drop.tiktokVideoId) {
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

  return `https://www.tiktok.com/player/v1/${props.drop.tiktokVideoId}?${params.toString()}`
})

const sendTikTokCommand = (type: 'play' | 'pause' | 'mute' | 'unMute') => {
  tiktokWebview.value?.send('tiktok-command', type)
}

const applyDropVolume = () => {
  sendTikTokCommand(normalizedDropVolume.value <= 0 ? 'mute' : 'unMute')
}

const handleTikTokLoad = () => {
  applyDropVolume()
  sendTikTokCommand('play')
}

const isTikTokPlayerMessage = (value: unknown): value is TikTokPlayerMessage => {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as Partial<TikTokPlayerMessage>)['x-tiktok-player'] === true &&
      typeof (value as Partial<TikTokPlayerMessage>).type === 'string',
  )
}

const handleTikTokIpcMessage = (event: TikTokIpcMessageEvent) => {
  if (event.channel === 'tiktok-ended' && props.drop.id) {
    emit('advance', props.drop.id)
    return
  }

  if (event.channel === 'tiktok-error' && props.drop.id) {
    emit('advance', props.drop.id)
    return
  }

  if (event.channel !== 'tiktok-player-message' || !isTikTokPlayerMessage(event.args[0])) {
    return
  }

  const message = event.args[0]

  if (message.type === 'onPlayerReady') {
    handleTikTokLoad()
    return
  }

  if (message.type === 'onStateChange' && message.value === TIKTOK_PLAYER_STATE_ENDED) {
    emit('advance', props.drop.id)
    return
  }

  if (message.type === 'onPlayerError' && props.drop.id) {
    emit('advance', props.drop.id)
  }
}

watch(
  () => props.volume,
  () => applyDropVolume(),
)

void window.memedrop?.getTikTokPreloadUrl().then((preloadUrl) => {
  tiktokPreloadUrl.value = preloadUrl
})
</script>

<template>
  <div
    class="mx-auto flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-black"
    :style="frameStyle"
  >
    <webview
      v-if="tiktokPreloadUrl"
      ref="tiktokWebview"
      :key="`tiktok-${drop.id}`"
      :src="tiktokEmbedUrl"
      :preload="tiktokPreloadUrl"
      partition="persist:memedrop-tiktok"
      webpreferences="contextIsolation=yes"
      class="h-full max-h-full aspect-9/16 border-0"
      @dom-ready="handleTikTokLoad"
      @ipc-message="handleTikTokIpcMessage"
    />
  </div>
</template>
