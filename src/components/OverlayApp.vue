<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { Drop } from '../../shared/types'
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
}>()

defineEmits<{
  advance: [dropId?: string]
}>()
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
      @advance="$emit('advance', $event)"
    />
  </div>
</template>
