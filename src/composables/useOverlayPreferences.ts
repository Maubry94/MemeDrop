import { computed, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import type {
  OverlayAnchor,
  OverlayDisplayInfo,
  OverlayDisplayPreferences,
  OverlayPosition,
} from '../../shared/types'

export const useOverlayPreferences = () => {
  const overlayPosition = ref<OverlayPosition>('full')
  const overlayDisplayId = ref('primary')
  const overlayDisplays = ref<OverlayDisplayInfo[]>([])
  const dropVolume = ref(100)
  const dropSize = ref(100)
  const customX = ref(50)
  const customY = ref(50)
  const customAnchor = ref<OverlayAnchor>('full')
  let syncingDisplayPreferences = false

  const overlayClasses = computed(() => {
    if (overlayPosition.value === 'custom') {
      return 'p-10'
    }

    switch (overlayPosition.value) {
      case 'full':
        return 'items-center justify-center p-10'
      case 'top-left':
        return 'items-start justify-start p-10'
      case 'top-right':
        return 'items-start justify-end p-10'
      case 'bottom-left':
        return 'items-end justify-start p-10'
      case 'bottom-right':
      default:
        return 'items-end justify-end p-10'
    }
  })

  const overlayCustomStyle = computed<CSSProperties>(() => {
    if (overlayPosition.value !== 'custom') {
      return {}
    }

    return {
      left: `${customX.value}%`,
      top: `${customY.value}%`,
      transform: `translate(-${customX.value}%, -${customY.value}%)`,
    }
  })

  const getCurrentOverlayDisplayPreferences = (): OverlayDisplayPreferences => ({
    displayId: overlayDisplayId.value,
    position: overlayPosition.value,
    volume: dropVolume.value,
    size: dropSize.value,
    customX: customX.value,
    customY: customY.value,
    customAnchor: customAnchor.value,
  })

  const applyOverlayDisplayPreferences = (preferences: OverlayDisplayPreferences) => {
    syncingDisplayPreferences = true
    overlayDisplayId.value = preferences.displayId
    overlayPosition.value = preferences.position
    dropVolume.value = preferences.volume
    dropSize.value = preferences.size
    customX.value = preferences.customX
    customY.value = preferences.customY
    customAnchor.value = preferences.customAnchor
    syncingDisplayPreferences = false
  }

  const saveOverlayDisplayPreferences = async () => {
    if (syncingDisplayPreferences || !window.memedrop) {
      return
    }

    applyOverlayDisplayPreferences(
      await window.memedrop.setOverlayDisplayPreferences(getCurrentOverlayDisplayPreferences()),
    )
  }

  watch(overlayPosition, () => {
    void saveOverlayDisplayPreferences()
  })

  watch(overlayDisplayId, () => {
    void saveOverlayDisplayPreferences()
  })

  watch(dropVolume, () => {
    void saveOverlayDisplayPreferences()
  })

  watch(dropSize, () => {
    void saveOverlayDisplayPreferences()
  })

  watch(customX, () => {
    void saveOverlayDisplayPreferences()
  })

  watch(customY, () => {
    void saveOverlayDisplayPreferences()
  })

  watch(customAnchor, () => {
    void saveOverlayDisplayPreferences()
  })

  return {
    overlayPosition,
    overlayDisplayId,
    overlayDisplays,
    dropVolume,
    dropSize,
    customX,
    customY,
    customAnchor,
    overlayClasses,
    overlayCustomStyle,
    applyOverlayDisplayPreferences,
  }
}
