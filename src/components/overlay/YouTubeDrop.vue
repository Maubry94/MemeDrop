<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import type { Drop } from '../../../shared/types'

type YouTubePlayerEvent = {
  data: number
  target: YouTubePlayer
}
type YouTubePlayer = {
  destroy: () => void
  getPlayerState: () => number
  playVideo: () => void
  setVolume: (volume: number) => void
  stopVideo?: () => void
}
type YouTubeApi = {
  Player: new (
    element: HTMLIFrameElement,
    options: {
      events: {
        onReady?: (event: YouTubePlayerEvent) => void
        onStateChange?: (event: YouTubePlayerEvent) => void
      }
    },
  ) => YouTubePlayer
  PlayerState: {
    ENDED: number
    PLAYING: number
  }
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

const props = defineProps<{
  drop: Drop
  volume: number
  frameStyle: CSSProperties
}>()

const emit = defineEmits<{
  advance: [dropId?: string]
}>()

const youtubeIframe = ref<HTMLIFrameElement | null>(null)

let youtubeStateTimer: number | undefined
let youtubeApiPromise: Promise<YouTubeApi> | null = null
let youtubePlayer: YouTubePlayer | null = null
let youtubePlayerDropId: string | null = null

const normalizedDropVolume = computed(() => Math.min(Math.max(props.volume, 0), 100) / 100)

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

  return `https://www.youtube.com/embed/${props.drop.youtubeVideoId}?${params.toString()}`
})

const sendYouTubeCommand = (func: string, args: unknown[] = []) => {
  youtubeIframe.value?.contentWindow?.postMessage(
    JSON.stringify({
      event: 'command',
      func,
      args,
    }),
    'https://www.youtube.com',
  )
}

const clearYouTubeStateTimer = () => {
  if (youtubeStateTimer) {
    window.clearInterval(youtubeStateTimer)
    youtubeStateTimer = undefined
  }
}

const loadYouTubeApi = () => {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise
  }

  youtubeApiPromise = new Promise<YouTubeApi>((resolve) => {
    const previousCallback = window.onYouTubeIframeAPIReady

    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.()
      if (window.YT) {
        resolve(window.YT)
      }
    }

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      document.head.append(script)
    }
  })

  return youtubeApiPromise
}

const resetYouTubePlayer = () => {
  youtubePlayer?.stopVideo?.()
  youtubePlayer = null
  youtubePlayerDropId = null
}

const destroyYouTubePlayer = () => {
  const player = youtubePlayer
  youtubePlayer = null
  youtubePlayerDropId = null
  player?.destroy()
}

const startYouTubeStatePolling = () => {
  clearYouTubeStateTimer()
  youtubeStateTimer = window.setInterval(() => {
    if (props.drop.id && youtubePlayer?.getPlayerState() === 0) {
      emit('advance', props.drop.id)
    }
  }, 1000)
}

const applyDropVolume = () => {
  youtubePlayer?.setVolume(Math.round(normalizedDropVolume.value * 100))
  sendYouTubeCommand('setVolume', [Math.round(normalizedDropVolume.value * 100)])
}

const initializeYouTubePlayer = async () => {
  if (!youtubeIframe.value) {
    return
  }

  if (youtubePlayer && youtubePlayerDropId === props.drop.id) {
    return
  }

  resetYouTubePlayer()

  const dropId = props.drop.id
  const api = await loadYouTubeApi()

  if (!youtubeIframe.value || props.drop.id !== dropId) {
    return
  }

  youtubePlayerDropId = dropId
  youtubePlayer = new api.Player(youtubeIframe.value, {
    events: {
      onReady: (event) => {
        event.target.setVolume(Math.round(normalizedDropVolume.value * 100))
        event.target.playVideo()
        startYouTubeStatePolling()
      },
      onStateChange: (event) => {
        if (event.data === api.PlayerState.ENDED) {
          emit('advance', dropId)
        }
      },
    },
  })
}

const handleYouTubeLoad = () => {
  applyDropVolume()
  sendYouTubeCommand('addEventListener', ['onStateChange'])
  sendYouTubeCommand('playVideo')
  void initializeYouTubePlayer()
  startYouTubeStatePolling()
}

const handleYouTubeMessage = (event: MessageEvent) => {
  if (
    event.origin !== 'https://www.youtube.com' ||
    event.source !== youtubeIframe.value?.contentWindow
  ) {
    return
  }

  try {
    const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
    const playerState =
      typeof message?.info === 'number'
        ? message.info
        : message?.info?.playerState ?? message?.data

    if (playerState === 0 && props.drop.id) {
      emit('advance', props.drop.id)
      return
    }

    if (message?.event === 'onReady' || message?.event === 'initialDelivery') {
      handleYouTubeLoad()
    }
  } catch {
    // YouTube can send non-JSON messages; they are not useful here.
  }
}

watch(
  () => props.volume,
  () => applyDropVolume(),
)

watch(
  () => props.drop.id,
  () => {
    clearYouTubeStateTimer()
    resetYouTubePlayer()
  },
)

onMounted(() => {
  window.addEventListener('message', handleYouTubeMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleYouTubeMessage)
  clearYouTubeStateTimer()
  destroyYouTubePlayer()
})
</script>

<template>
  <div
    class="mx-auto aspect-video w-full max-w-[calc(60vh*16/9)] overflow-hidden rounded-2xl bg-black"
    :style="frameStyle"
  >
    <iframe
      ref="youtubeIframe"
      :key="`youtube-${drop.id}`"
      :src="youtubeEmbedUrl"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
      class="h-full w-full border-0"
      @load="handleYouTubeLoad"
    />
  </div>
</template>
