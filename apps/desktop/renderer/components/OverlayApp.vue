<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { Drop, DropCompletionReason } from '../../shared/types'
import type { MediaKind } from '../../shared/media'
import DropOverlay from './overlay/DropOverlay.vue'

defineProps<{
  activeDrop: Drop | null
  activeKind: MediaKind
  hasDrop: boolean
  overlayClasses: string
  overlayCustomStyle: CSSProperties
  dropVolume: number
  dropSize: number
  isCustomPosition: boolean
  keepTestImageVisible: boolean
}>()

const emit = defineEmits<{
  advance: [dropId: string, reason: DropCompletionReason]
}>()

const forwardAdvance = (dropId: string, reason: DropCompletionReason) =>
  emit('advance', dropId, reason)
</script>

<template>
  <div class="relative h-full w-full">
    <DropOverlay
      :active-drop="activeDrop"
      :active-kind="activeKind"
      :has-drop="hasDrop"
      :overlay-classes="overlayClasses"
      :custom-style="overlayCustomStyle"
      :volume="dropVolume"
      :size="dropSize"
      :is-custom-position="isCustomPosition"
      :keep-test-image-visible="keepTestImageVisible"
      @advance="forwardAdvance"
    />
  </div>
</template>
