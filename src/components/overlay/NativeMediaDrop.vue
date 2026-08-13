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
}>()

const imageElement = ref<HTMLImageElement | null>(null)
const videoElement = ref<HTMLVideoElement | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const mediaGeneration = ref(0)

let nativeMediaWatchdogTimer: number | undefined
let nativeMediaWatchdogRevision = 0
let completedGeneration: number | null = null
let playbackStartedGeneration: number | null = null
let lastCurrentTime: number | null = null

const normalizedDropVolume = computed(() => Math.min(Math.max(props.volume, 0), 100) / 100)

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

  armNativeMediaWatchdog(identity, IMAGE_DISPLAY_TIMEOUT_MS, 'display-complete')
}

const handleImageError = (event: Event) => {
  const identity = getImageIdentity(event)
  if (identity) {
    advanceDrop(identity)
  }
}

const handleMediaMetadata = (event: Event) => {
  if (getMediaIdentity(event)) {
    applyDropVolume()
  }
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
  lastCurrentTime = null

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
    class="mx-auto aspect-video w-full max-w-[calc(60vh*16/9)] overflow-hidden rounded-2xl bg-black"
    :style="frameStyle"
  >
    <img
      v-if="kind === 'image'"
      ref="imageElement"
      :key="`image-${drop.id}-${mediaGeneration}`"
      :data-drop-id="drop.id"
      :data-generation="mediaGeneration"
      :src="drop.url"
      :alt="drop.caption ?? 'MemeDrop image'"
      class="h-full w-full object-contain"
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
      class="h-full w-full object-contain"
      @ended="handleMediaEnded"
      @error="handleMediaError"
      @loadedmetadata="handleMediaMetadata"
      @stalled="handleMediaStall"
      @timeupdate="handleMediaTimeUpdate"
      @waiting="handleMediaStall"
    />
  </div>

  <audio
    v-else
    ref="audioElement"
    :key="`audio-${drop.id}-${mediaGeneration}`"
    :data-drop-id="drop.id"
    :data-generation="mediaGeneration"
    :src="drop.url"
    autoplay
    controls
    @ended="handleMediaEnded"
    @error="handleMediaError"
    @loadedmetadata="handleMediaMetadata"
    @stalled="handleMediaStall"
    @timeupdate="handleMediaTimeUpdate"
    @waiting="handleMediaStall"
  />
</template>
