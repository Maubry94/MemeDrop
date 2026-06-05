<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import type { MediaKind } from '../../../shared/media'
import type { Drop } from '../../../shared/types'

const props = defineProps<{
  drop: Drop
  kind: Extract<MediaKind, 'image' | 'video' | 'audio'>
  volume: number
  frameStyle: CSSProperties
}>()

const emit = defineEmits<{
  advance: []
}>()

const videoElement = ref<HTMLVideoElement | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)

const normalizedDropVolume = computed(() => Math.min(Math.max(props.volume, 0), 100) / 100)

const applyDropVolume = () => {
  if (videoElement.value) {
    videoElement.value.volume = normalizedDropVolume.value
  }

  if (audioElement.value) {
    audioElement.value.volume = normalizedDropVolume.value
  }
}

watch(
  () => props.volume,
  () => applyDropVolume(),
)
</script>

<template>
  <div
    v-if="kind === 'image' || kind === 'video'"
    class="mx-auto aspect-video w-full max-w-[calc(60vh*16/9)] overflow-hidden rounded-2xl bg-black"
    :style="frameStyle"
  >
    <img
      v-if="kind === 'image'"
      :src="drop.url"
      :alt="drop.caption ?? 'MemeDrop image'"
      class="h-full w-full object-contain"
    />
    <video
      v-else
      ref="videoElement"
      :key="`video-${drop.id}`"
      :src="drop.url"
      autoplay
      playsinline
      class="h-full w-full object-contain"
      @loadedmetadata="applyDropVolume"
      @ended="emit('advance')"
      @error="emit('advance')"
    />
  </div>

  <audio
    v-else
    ref="audioElement"
    :key="`audio-${drop.id}`"
    :src="drop.url"
    autoplay
    controls
    @loadedmetadata="applyDropVolume"
    @ended="emit('advance')"
    @error="emit('advance')"
  />
</template>
