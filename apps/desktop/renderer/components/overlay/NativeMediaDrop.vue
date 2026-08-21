<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import type { MediaKind } from '../../../shared/media'
import type { Drop } from '../../../shared/types'

type NativeMediaKind = Extract<MediaKind, 'image' | 'video' | 'audio'>
type NativeMediaIdentity = {
  dropId: string
  generation: number
}

const IMAGE_DISPLAY_TIMEOUT_MS = 9_000
const NATIVE_MEDIA_LOAD_TIMEOUT_MS = 30_000
const NATIVE_MEDIA_STALL_TIMEOUT_MS = 30_000
const NATIVE_MEDIA_PROGRESS_EPSILON_SECONDS = 0.05

const props = defineProps<{
  drop: Drop
  kind: NativeMediaKind
  volume: number
  frameStyle: CSSProperties
}>()

const emit = defineEmits<{
  advance: [dropId: string]
  loading: [dropId: string]
  ready: [dropId: string]
}>()

const imageElement = ref<HTMLImageElement | null>(null)
const videoElement = ref<HTMLVideoElement | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const mediaGeneration = ref(0)

let nativeMediaWatchdogTimer: number | undefined
let nativeMediaWatchdogRevision = 0
let completedGeneration: number | null = null
let playbackStartedGeneration: number | null = null
let visuallyReadyGeneration: number | null = null
let lastCurrentTime: number | null = null

const normalizedDropVolume = computed(() => Math.min(Math.max(props.volume, 0), 100) / 100)
const audioFileName = computed(() => props.drop.fileName?.trim() || 'Audio MemeDrop')

const clearNativeMediaWatchdog = () => {
  nativeMediaWatchdogRevision += 1
  if (nativeMediaWatchdogTimer !== undefined) {
    window.clearTimeout(nativeMediaWatchdogTimer)
    nativeMediaWatchdogTimer = undefined
  }
}

const isCurrentIdentity = ({ dropId, generation }: NativeMediaIdentity) =>
  props.drop.id === dropId &&
  mediaGeneration.value === generation &&
  completedGeneration !== generation

const advanceDrop = ({ dropId, generation }: NativeMediaIdentity) => {
  if (!isCurrentIdentity({ dropId, generation })) {
    return
  }

  completedGeneration = generation
  clearNativeMediaWatchdog()
  emit('advance', dropId)
}

const armNativeMediaWatchdog = (
  identity: NativeMediaIdentity,
  delay: number,
  reason: 'display-complete' | 'load-timeout' | 'stall-timeout',
) => {
  if (!isCurrentIdentity(identity)) {
    return
  }

  clearNativeMediaWatchdog()
  const expectedWatchdogRevision = nativeMediaWatchdogRevision
  nativeMediaWatchdogTimer = window.setTimeout(() => {
    if (
      !isCurrentIdentity(identity) ||
      nativeMediaWatchdogRevision !== expectedWatchdogRevision
    ) {
      return
    }

    nativeMediaWatchdogTimer = undefined
    nativeMediaWatchdogRevision += 1
    if (reason !== 'display-complete') {
      console.warn('Média natif indisponible.', { ...identity, reason })
    }
    advanceDrop(identity)
  }, delay)
}

const getElementIdentity = (
  element: HTMLImageElement | HTMLMediaElement,
): NativeMediaIdentity | null => {
  const dropId = element.dataset.dropId
  const generation = Number(element.dataset.generation)
  if (!dropId || !Number.isSafeInteger(generation)) {
    return null
  }

  const identity = { dropId, generation }
  return isCurrentIdentity(identity) ? identity : null
}

const getImageIdentity = (event: Event) => {
  const image = event.currentTarget as HTMLImageElement
  if (image !== imageElement.value) {
    return null
  }

  return getElementIdentity(image)
}

const getMediaIdentity = (event: Event) => {
  const media = event.currentTarget as HTMLMediaElement
  if (media !== videoElement.value && media !== audioElement.value) {
    return null
  }

  return getElementIdentity(media)
}

const applyDropVolume = () => {
  if (videoElement.value) {
    videoElement.value.volume = normalizedDropVolume.value
  }

  if (audioElement.value) {
    audioElement.value.volume = normalizedDropVolume.value
  }
}

const handleImageLoad = (event: Event) => {
  const identity = getImageIdentity(event)
  if (!identity) {
    return
  }

  visuallyReadyGeneration = identity.generation
  emit('ready', identity.dropId)
  armNativeMediaWatchdog(identity, IMAGE_DISPLAY_TIMEOUT_MS, 'display-complete')
}

const handleImageError = (event: Event) => {
  const identity = getImageIdentity(event)
  if (identity) {
    advanceDrop(identity)
  }
}

const handleMediaMetadata = (event: Event) => {
  const identity = getMediaIdentity(event)
  if (!identity) {
    return
  }

  applyDropVolume()
}

const handleMediaLoadedData = (event: Event) => {
  const media = event.currentTarget as HTMLMediaElement
  const identity = getMediaIdentity(event)
  if (!identity) {
    return
  }

  applyDropVolume()
  if (media === videoElement.value && visuallyReadyGeneration !== identity.generation) {
    visuallyReadyGeneration = identity.generation
    emit('ready', identity.dropId)
  }
}

const handleMediaPlaying = (event: Event) => {
  const media = event.currentTarget as HTMLMediaElement
  const identity = getMediaIdentity(event)
  if (
    !identity ||
    media !== audioElement.value ||
    visuallyReadyGeneration === identity.generation
  ) {
    return
  }

  visuallyReadyGeneration = identity.generation
  emit('ready', identity.dropId)
}

const markMediaProgress = (identity: NativeMediaIdentity) => {
  if (!isCurrentIdentity(identity)) {
    return
  }

  playbackStartedGeneration = identity.generation
  armNativeMediaWatchdog(identity, NATIVE_MEDIA_STALL_TIMEOUT_MS, 'stall-timeout')
}

const handleMediaTimeUpdate = (event: Event) => {
  const media = event.currentTarget as HTMLMediaElement
  const identity = getMediaIdentity(event)
  if (!identity || !Number.isFinite(media.currentTime) || media.currentTime < 0) {
    return
  }

  const previousTime = lastCurrentTime
  if (previousTime === null) {
    lastCurrentTime = media.currentTime
    if (media.currentTime > NATIVE_MEDIA_PROGRESS_EPSILON_SECONDS) {
      markMediaProgress(identity)
    }
    return
  }

  if (
    media.currentTime > previousTime + NATIVE_MEDIA_PROGRESS_EPSILON_SECONDS ||
    media.currentTime < previousTime - 0.5
  ) {
    lastCurrentTime = media.currentTime
    markMediaProgress(identity)
  }
}

const handleMediaStall = (event: Event) => {
  const identity = getMediaIdentity(event)
  if (
    identity &&
    playbackStartedGeneration === identity.generation &&
    nativeMediaWatchdogTimer === undefined
  ) {
    armNativeMediaWatchdog(identity, NATIVE_MEDIA_STALL_TIMEOUT_MS, 'stall-timeout')
  }
}

const handleMediaEnded = (event: Event) => {
  const identity = getMediaIdentity(event)
  if (identity) {
    advanceDrop(identity)
  }
}

const handleMediaError = (event: Event) => {
  const identity = getMediaIdentity(event)
  if (identity) {
    advanceDrop(identity)
  }
}

const resetNativeMedia = () => {
  clearNativeMediaWatchdog()
  mediaGeneration.value += 1
  completedGeneration = null
  playbackStartedGeneration = null
  visuallyReadyGeneration = null
  lastCurrentTime = null

  emit('loading', props.drop.id)

  const identity = {
    dropId: props.drop.id,
    generation: mediaGeneration.value,
  }
  if (!props.drop.url) {
    window.queueMicrotask(() => advanceDrop(identity))
    return
  }

  armNativeMediaWatchdog(identity, NATIVE_MEDIA_LOAD_TIMEOUT_MS, 'load-timeout')
}

watch(
  () => [props.drop.id, props.drop.url, props.kind] as const,
  () => resetNativeMedia(),
  { immediate: true },
)

watch(
  () => props.volume,
  () => {
    if (completedGeneration !== mediaGeneration.value) {
      applyDropVolume()
    }
  },
)

onBeforeUnmount(() => {
  clearNativeMediaWatchdog()
})
</script>

<template>
  <div
    v-if="kind === 'image' || kind === 'video'"
    class="relative mx-auto flex w-fit max-w-full items-center justify-center overflow-hidden rounded-xl bg-slate-950 ring-1 ring-white/5"
  >
    <img
      v-if="kind === 'image'"
      ref="imageElement"
      :key="`image-${drop.id}-${mediaGeneration}`"
      :data-drop-id="drop.id"
      :data-generation="mediaGeneration"
      :src="drop.url"
      :alt="drop.caption ?? 'MemeDrop image'"
      class="block h-auto w-auto max-w-full object-contain"
      :style="frameStyle"
      @error="handleImageError"
      @load="handleImageLoad"
    />
    <video
      v-else
      ref="videoElement"
      :key="`video-${drop.id}-${mediaGeneration}`"
      :data-drop-id="drop.id"
      :data-generation="mediaGeneration"
      :src="drop.url"
      autoplay
      playsinline
      class="block h-auto w-auto max-w-full object-contain"
      :style="frameStyle"
      @ended="handleMediaEnded"
      @error="handleMediaError"
      @loadeddata="handleMediaLoadedData"
      @loadedmetadata="handleMediaMetadata"
      @stalled="handleMediaStall"
      @timeupdate="handleMediaTimeUpdate"
      @waiting="handleMediaStall"
    />
  </div>

  <template v-else>
    <div
      class="mx-auto flex min-h-20 w-full min-w-0 items-center gap-3 rounded-xl border border-white/5 bg-slate-950/90 p-3 shadow-inner"
      :style="frameStyle"
    >
      <span
        class="flex size-11 shrink-0 items-end justify-center gap-1 rounded-full bg-sky-400/10 px-2.5 py-3 text-sky-200"
        aria-hidden="true"
      >
        <span class="h-2 w-1 rounded-full bg-current opacity-60" />
        <span class="h-4 w-1 rounded-full bg-current" />
        <span class="h-3 w-1 rounded-full bg-current opacity-80" />
        <span class="h-1.5 w-1 rounded-full bg-current opacity-50" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-xs text-slate-400">Lecture audio</span>
        <span class="mt-0.5 block truncate text-base font-semibold text-slate-100">
          {{ audioFileName }}
        </span>
      </span>
    </div>

    <audio
      ref="audioElement"
      :key="`audio-${drop.id}-${mediaGeneration}`"
      :data-drop-id="drop.id"
      :data-generation="mediaGeneration"
      :src="drop.url"
      autoplay
      class="sr-only"
      aria-hidden="true"
      tabindex="-1"
      @ended="handleMediaEnded"
      @error="handleMediaError"
      @loadeddata="handleMediaLoadedData"
      @loadedmetadata="handleMediaMetadata"
      @playing="handleMediaPlaying"
      @stalled="handleMediaStall"
      @timeupdate="handleMediaTimeUpdate"
      @waiting="handleMediaStall"
    />
  </template>
</template>
