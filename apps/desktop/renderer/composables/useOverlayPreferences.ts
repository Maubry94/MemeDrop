import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import type {
  OverlayAnchor,
  OverlayDisplayInfo,
  OverlayDisplayPreferences,
  OverlayPosition,
} from '../../shared/types'
import { createFrameCoalescedSync } from './frameCoalescedSync'

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

  const preferenceSync = createFrameCoalescedSync({
    read: getCurrentOverlayDisplayPreferences,
    write: (preferences) =>
      window.memedrop?.setOverlayDisplayPreferences(preferences),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
    onError: (error) => {
      console.error("Mise à jour des préférences d'affichage impossible :", error)
    },
  })

  watch(
    [
      overlayPosition,
      overlayDisplayId,
      dropVolume,
      dropSize,
      customX,
      customY,
      customAnchor,
    ],
    () => {
      if (!syncingDisplayPreferences) {
        preferenceSync.schedule()
      }
    },
    { flush: 'sync' },
  )

  const flushPendingPreferenceSync = () => {
    preferenceSync.flush()
  }

  const flushPendingPreferenceSyncWhenHidden = () => {
    if (document.visibilityState === 'hidden') {
      preferenceSync.flush()
    }
  }

  window.addEventListener('pagehide', flushPendingPreferenceSync)
  document.addEventListener('visibilitychange', flushPendingPreferenceSyncWhenHidden)

  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', flushPendingPreferenceSync)
    document.removeEventListener('visibilitychange', flushPendingPreferenceSyncWhenHidden)
    preferenceSync.flush()
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
