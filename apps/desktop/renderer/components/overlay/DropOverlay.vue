<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import type { MediaKind } from '../../../shared/media'
import type { Drop } from '../../../shared/types'
import DropAuthor from './DropAuthor.vue'
import NativeMediaDrop from './NativeMediaDrop.vue'
import TikTokDrop from './TikTokDrop.vue'
import YouTubeDrop from './YouTubeDrop.vue'
import { getOverlayWrapperStyle } from './overlayLayout'

const props = defineProps<{
  activeDrop: Drop | null
  activeKind: MediaKind
  hasDrop: boolean
  overlayClasses: string
  customStyle: CSSProperties
  volume: number
  size: number
  isCustomPosition: boolean
  keepTestImageVisible: boolean
}>()

const emit = defineEmits<{
  advance: [dropId?: string]
}>()

const isActiveDropReady = ref(false)

const normalizedDropSize = computed(() => Math.min(Math.max(props.size, 40), 130) / 100)

const isCurrentDropId = (dropId: string) =>
  props.hasDrop && props.activeDrop?.id === dropId

const handleDropLoading = (dropId: string) => {
  if (isCurrentDropId(dropId)) {
    isActiveDropReady.value = false
  }
}

const handleDropReady = (dropId: string) => {
  if (isCurrentDropId(dropId)) {
    isActiveDropReady.value = true
  }
}

watch(
  () => [props.activeDrop?.id, props.activeKind, props.hasDrop] as const,
  () => {
    isActiveDropReady.value = false
  },
  { immediate: true, flush: 'sync' },
)

const overlayWrapperClasses = computed(() =>
  props.isCustomPosition ? '' : `inset-0 flex ${props.overlayClasses}`,
)

const overlayWrapperStyle = computed<CSSProperties>(() =>
  getOverlayWrapperStyle(props.isCustomPosition, props.customStyle),
)

const landscapeFrameWidth = computed(
  () => `min(calc(60vh * 16 / 9), ${Math.round(880 * normalizedDropSize.value)}px, calc(90vw - 1.5rem))`,
)

const portraitFrameWidth = computed(
  () => `min(max(${Math.round(405 * normalizedDropSize.value)}px, 216px), 33.75vh, calc(86vw - 1.5rem))`,
)

const audioFrameWidth = computed(
  () => `min(max(${Math.round(520 * normalizedDropSize.value)}px, 280px), calc(86vw - 1.5rem))`,
)

const dropCardStyle = computed<CSSProperties>(() => {
  if (props.activeKind === 'tiktok') {
    return { width: `calc(${portraitFrameWidth.value} + 1.5rem)` }
  }

  if (props.activeKind === 'audio') {
    return { width: `calc(${audioFrameWidth.value} + 1.5rem)` }
  }

  if (props.activeKind === 'youtube') {
    return { width: `calc(${landscapeFrameWidth.value} + 1.5rem)` }
  }

  return {
    width: 'fit-content',
    minWidth: 'min(280px, 90vw)',
    maxWidth: '90vw',
  }
})

const mediaFrameStyle = computed<CSSProperties>(() => {
  if (props.activeKind === 'tiktok') {
    return {
      maxWidth: portraitFrameWidth.value,
    }
  }

  if (props.activeKind === 'audio') {
    return {
      width: audioFrameWidth.value,
      maxWidth: '100%',
    }
  }

  if (props.activeKind === 'image' || props.activeKind === 'video') {
    return {
      width: landscapeFrameWidth.value,
      maxWidth: '100%',
      maxHeight: `min(${Math.round(680 * normalizedDropSize.value)}px, 64vh, calc(100vh - 11rem))`,
    }
  }

  return {
    width: landscapeFrameWidth.value,
    maxWidth: '100%',
    aspectRatio: '16 / 9',
  }
})

const isNativeMediaKind = (
  kind: MediaKind,
): kind is Extract<MediaKind, 'image' | 'video' | 'audio'> =>
  kind === 'image' || kind === 'video' || kind === 'audio'
</script>

<template>
  <div
    class="pointer-events-none absolute"
    :class="overlayWrapperClasses"
    :style="overlayWrapperStyle"
    aria-hidden="true"
  >
    <div
      v-if="hasDrop && activeDrop"
      :key="`${activeDrop.id}-${activeKind}`"
      class="pointer-events-none max-h-[calc(100vh-3rem)] overflow-hidden rounded-2xl border border-overlay-border bg-overlay-bg p-3 shadow-[0_18px_55px_rgba(0,0,0,0.36)] backdrop-blur-md"
      :class="isActiveDropReady ? 'drop-card-ready opacity-100' : 'opacity-0'"
      :style="dropCardStyle"
    >
      <div class="flex min-h-0 flex-col gap-3">
        <NativeMediaDrop
          v-if="isNativeMediaKind(activeKind)"
          :drop="activeDrop"
          :kind="activeKind"
          :volume="volume"
          :frame-style="mediaFrameStyle"
          :keep-image-visible="keepTestImageVisible"
          @advance="emit('advance', $event)"
          @loading="handleDropLoading"
          @ready="handleDropReady"
        />
        <YouTubeDrop
          v-else-if="activeKind === 'youtube'"
          :drop="activeDrop"
          :volume="volume"
          :frame-style="mediaFrameStyle"
          @advance="emit('advance', $event)"
          @loading="handleDropLoading"
          @ready="handleDropReady"
        />
        <TikTokDrop
          v-else-if="activeKind === 'tiktok'"
          :drop="activeDrop"
          :volume="volume"
          :frame-style="mediaFrameStyle"
          @advance="emit('advance', $event)"
          @loading="handleDropLoading"
          @ready="handleDropReady"
        />
      </div>

      <div
        v-if="activeDrop.caption || activeDrop.author"
        class="mt-3 w-0 min-w-full max-w-full space-y-2 px-1 pb-0.5"
      >
        <p v-if="activeDrop.caption" class="drop-caption font-semibold leading-snug text-slate-100">
          {{ activeDrop.caption }}
        </p>
        <DropAuthor
          v-if="activeDrop.author"
          :author="activeDrop.author"
          :avatar-url="activeDrop.authorAvatarUrl"
          :is-anonymous="activeDrop.isAnonymous"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.drop-card-ready {
  animation: drop-card-enter 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.drop-caption {
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: clamp(1rem, 1.5vw, 1.35rem);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

@keyframes drop-card-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .drop-card-ready {
    animation: none;
  }
}
</style>
