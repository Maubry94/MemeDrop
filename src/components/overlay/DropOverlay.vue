<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Drop } from '../../shared/types'
import type { MediaKind } from '../../shared/media'
import DropAuthor from './DropAuthor.vue'

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
  activeDrop: Drop | null
  activeKind: MediaKind
  hasDrop: boolean
  overlayClasses: string
  volume: number
}>()

const emit = defineEmits<{
  advance: [dropId?: string]
}>()

const videoElement = ref<HTMLVideoElement | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const youtubeIframe = ref<HTMLIFrameElement | null>(null)

let youtubeStateTimer: number | undefined
let youtubeApiPromise: Promise<YouTubeApi> | null = null
let youtubePlayer: YouTubePlayer | null = null
let youtubePlayerDropId: string | null = null

const normalizedDropVolume = computed(() => Math.min(Math.max(props.volume, 0), 100) / 100)

const youtubeEmbedUrl = computed(() => {
  if (!props.activeDrop?.youtubeVideoId) {
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

  return `https://www.youtube.com/embed/${props.activeDrop.youtubeVideoId}?${params.toString()}`
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
    if (props.activeKind !== 'youtube') {
      clearYouTubeStateTimer()
      return
    }

    const dropId = props.activeDrop?.id
    if (dropId && youtubePlayer?.getPlayerState() === 0) {
      emit('advance', dropId)
    }
  }, 1000)
}

const applyDropVolume = () => {
  if (videoElement.value) {
    videoElement.value.volume = normalizedDropVolume.value
  }

  if (audioElement.value) {
    audioElement.value.volume = normalizedDropVolume.value
  }

  youtubePlayer?.setVolume(Math.round(normalizedDropVolume.value * 100))
  sendYouTubeCommand('setVolume', [Math.round(normalizedDropVolume.value * 100)])
}

const initializeYouTubePlayer = async () => {
  if (!youtubeIframe.value || !props.activeDrop || props.activeKind !== 'youtube') {
    return
  }

  if (youtubePlayer && youtubePlayerDropId === props.activeDrop.id) {
    return
  }

  resetYouTubePlayer()

  const dropId = props.activeDrop.id
  const api = await loadYouTubeApi()

  if (!youtubeIframe.value || props.activeDrop?.id !== dropId) {
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
        if (event.data === api.PlayerState.ENDED && props.activeKind === 'youtube') {
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

    if (playerState === 0 && props.activeKind === 'youtube' && props.activeDrop?.id) {
      emit('advance', props.activeDrop.id)
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
  () => props.activeDrop?.id,
  () => {
    clearYouTubeStateTimer()
    resetYouTubePlayer()
  },
)

window.addEventListener('message', handleYouTubeMessage)

onBeforeUnmount(() => {
  window.removeEventListener('message', handleYouTubeMessage)
  clearYouTubeStateTimer()
  destroyYouTubePlayer()
})
</script>

<template>
  <div class="pointer-events-none absolute inset-0 flex" :class="overlayClasses">
    <div
      v-if="hasDrop"
      class="pointer-events-none w-full max-w-[min(880px,90vw)] rounded-3xl border border-overlay-border bg-overlay-bg p-6 backdrop-blur"
    >
      <div class="flex flex-col gap-4">
        <div
          v-if="['image', 'video', 'youtube'].includes(activeKind)"
          class="mx-auto aspect-video w-full max-w-[calc(60vh*16/9)] overflow-hidden rounded-2xl bg-black"
        >
          <img
            v-if="activeKind === 'image'"
            :src="activeDrop?.url"
            :alt="activeDrop?.caption ?? 'MemeDrop image'"
            class="h-full w-full object-contain"
          />
          <iframe
            v-else-if="activeKind === 'youtube'"
            ref="youtubeIframe"
            :key="`youtube-${activeDrop?.id}`"
            :src="youtubeEmbedUrl"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowfullscreen
            class="h-full w-full border-0"
            @load="handleYouTubeLoad"
          />
          <video
            v-else-if="activeKind === 'video'"
            ref="videoElement"
            :key="`video-${activeDrop?.id}`"
            :src="activeDrop?.url"
            autoplay
            playsinline
            class="h-full w-full object-contain"
            @loadedmetadata="applyDropVolume"
            @ended="() => emit('advance')"
            @error="() => emit('advance')"
          />
        </div>
        <audio
          v-else-if="activeKind === 'audio'"
          ref="audioElement"
          :key="`audio-${activeDrop?.id}`"
          :src="activeDrop?.url"
          autoplay
          controls
          @loadedmetadata="applyDropVolume"
          @ended="() => emit('advance')"
          @error="() => emit('advance')"
        />
      </div>

      <div v-if="activeDrop?.caption || activeDrop?.author" class="mt-4 space-y-3">
        <p v-if="activeDrop?.caption" class="text-2xl font-semibold text-slate-100">
          {{ activeDrop?.caption }}
        </p>
        <DropAuthor
          v-if="activeDrop?.author"
          :author="activeDrop.author"
          :avatar-url="activeDrop.authorAvatarUrl"
        />
      </div>
    </div>
  </div>
</template>
