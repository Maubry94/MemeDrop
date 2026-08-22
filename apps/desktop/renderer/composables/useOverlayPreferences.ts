import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
  let savePreferencesTimer: ReturnType<typeof setTimeout> | null = null

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
    if (savePreferencesTimer) {
      clearTimeout(savePreferencesTimer)
      savePreferencesTimer = null
    }

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

    await window.memedrop.setOverlayDisplayPreferences(getCurrentOverlayDisplayPreferences())
  }

  const scheduleOverlayDisplayPreferencesSave = () => {
    if (syncingDisplayPreferences) {
      return
    }

    if (savePreferencesTimer) {
      clearTimeout(savePreferencesTimer)
    }

    savePreferencesTimer = setTimeout(() => {
      savePreferencesTimer = null
      void saveOverlayDisplayPreferences()
    }, 150)
  }

  watch(
    overlayPosition,
    () => {
      scheduleOverlayDisplayPreferencesSave()
    },
    { flush: 'sync' },
  )

  watch(
    overlayDisplayId,
    () => {
      scheduleOverlayDisplayPreferencesSave()
    },
    { flush: 'sync' },
  )

  watch(
    dropVolume,
    () => {
      scheduleOverlayDisplayPreferencesSave()
    },
    { flush: 'sync' },
  )

  watch(
    dropSize,
    () => {
      scheduleOverlayDisplayPreferencesSave()
    },
    { flush: 'sync' },
  )

  watch(
    customX,
    () => {
      scheduleOverlayDisplayPreferencesSave()
    },
    { flush: 'sync' },
  )

  watch(
    customY,
    () => {
      scheduleOverlayDisplayPreferencesSave()
    },
    { flush: 'sync' },
  )

  watch(
    customAnchor,
    () => {
      scheduleOverlayDisplayPreferencesSave()
    },
    { flush: 'sync' },
  )

  onBeforeUnmount(() => {
    if (!savePreferencesTimer) {
      return
    }

    clearTimeout(savePreferencesTimer)
    savePreferencesTimer = null
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
