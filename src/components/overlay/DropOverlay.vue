<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import type { MediaKind } from '../../../shared/media'
import type { Drop } from '../../../shared/types'
import DropAuthor from './DropAuthor.vue'
import NativeMediaDrop from './NativeMediaDrop.vue'
import TikTokDrop from './TikTokDrop.vue'
import YouTubeDrop from './YouTubeDrop.vue'

const props = defineProps<{
  activeDrop: Drop | null
  activeKind: MediaKind
  hasDrop: boolean
  overlayClasses: string
  customStyle: CSSProperties
  volume: number
  size: number
  isCustomPosition: boolean
}>()

const emit = defineEmits<{
  advance: [dropId?: string]
}>()

const normalizedDropSize = computed(() => Math.min(Math.max(props.size, 40), 130) / 100)

const overlayWrapperClasses = computed(() =>
  props.isCustomPosition ? '' : `inset-0 flex ${props.overlayClasses}`,
)

const overlayWrapperStyle = computed<CSSProperties>(() =>
  props.isCustomPosition ? props.customStyle : {},
)

const dropCardStyle = computed<CSSProperties>(() => ({
  width: `min(${Math.round(880 * normalizedDropSize.value)}px, 90vw)`,
}))

const mediaFrameStyle = computed<CSSProperties>(() => ({
  maxWidth: `min(calc(60vh * 16 / 9), ${Math.round(880 * normalizedDropSize.value)}px, 90vw)`,
}))

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
  >
    <div
      v-if="hasDrop && activeDrop"
      class="pointer-events-none rounded-3xl border border-overlay-border bg-overlay-bg p-6 backdrop-blur"
      :style="dropCardStyle"
    >
      <div class="flex flex-col gap-4">
        <NativeMediaDrop
          v-if="isNativeMediaKind(activeKind)"
          :drop="activeDrop"
          :kind="activeKind"
          :volume="volume"
          :frame-style="mediaFrameStyle"
          @advance="emit('advance', $event)"
        />
        <YouTubeDrop
          v-else-if="activeKind === 'youtube'"
          :drop="activeDrop"
          :volume="volume"
          :frame-style="mediaFrameStyle"
          @advance="emit('advance', $event)"
        />
        <TikTokDrop
          v-else-if="activeKind === 'tiktok'"
          :drop="activeDrop"
          :volume="volume"
          :frame-style="mediaFrameStyle"
          @advance="emit('advance', $event)"
        />
      </div>

      <div v-if="activeDrop.caption || activeDrop.author" class="mt-4 space-y-3">
        <p v-if="activeDrop.caption" class="text-2xl font-semibold text-slate-100">
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
