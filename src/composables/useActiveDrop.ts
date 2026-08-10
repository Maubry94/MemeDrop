import { computed, onBeforeUnmount, ref, type ComputedRef } from 'vue'
import { getMediaKind } from '../../shared/media'
import type { Drop, ServerConfig } from '../../shared/types'

const TEST_DROP_ID = 'memedrop-test-preview'
const DISPLAY_MS = 9000

type ActiveDropOptions = {
  isOverlayView: ComputedRef<boolean>
  dropsEnabled: ComputedRef<boolean>
  serverConfig: ComputedRef<ServerConfig>
}

export const useActiveDrop = ({ isOverlayView, dropsEnabled, serverConfig }: ActiveDropOptions) => {
  const isTestDropActive = ref(false)
  const activeDrop = ref<Drop | null>(null)
  let activeDropTimer: number | undefined

  const activeKind = computed(() => getMediaKind(activeDrop.value))
  const hasDrop = computed(() => Boolean(activeDrop.value) && dropsEnabled.value)
  const canStopGlobalDrop = computed(
    () =>
      Boolean(activeDrop.value?.id) &&
      Boolean(serverConfig.value.discordUserId) &&
      (activeDrop.value?.ownerId ?? activeDrop.value?.authorId) === serverConfig.value.discordUserId,
  )

  const clearActiveDropTimer = () => {
    if (activeDropTimer) {
      window.clearTimeout(activeDropTimer)
      activeDropTimer = undefined
    }
  }

  const completeActiveDrop = async (expectedDropId?: string) => {
    const drop = activeDrop.value
    if (!drop) {
      return
    }

    if (expectedDropId && drop.id !== expectedDropId) {
      return
    }

    clearActiveDropTimer()
    activeDrop.value = null
    if (drop.id === TEST_DROP_ID) {
      isTestDropActive.value = false
      return
    }
    if (isOverlayView.value) {
      await window.memedropOverlay?.completeCurrentDrop(drop.id)
    } else {
      await window.memedrop?.completeCurrentDrop(drop.id)
    }
  }

  const scheduleActiveDrop = () => {
    clearActiveDropTimer()
    if (!activeDrop.value || !isOverlayView.value) {
      return
    }

    if (activeDrop.value.id === TEST_DROP_ID) {
      return
    }

    if (activeKind.value !== 'image') {
      return
    }

    activeDropTimer = window.setTimeout(() => {
      void completeActiveDrop(activeDrop.value?.id)
    }, DISPLAY_MS)
  }

  const receiveDrop = (drop: Drop) => {
    activeDrop.value = drop
    isTestDropActive.value = drop.id === TEST_DROP_ID

    if (!isOverlayView.value) {
      return
    }

    if (!dropsEnabled.value || getMediaKind(drop) === 'file') {
      void completeActiveDrop(drop.id)
      return
    }
    scheduleActiveDrop()
  }

  const clearServerDrop = () => {
    if (activeDrop.value?.id === TEST_DROP_ID) {
      return
    }

    clearActiveDropTimer()
    activeDrop.value = null
  }

  const clearTestDrop = () => {
    if (activeDrop.value?.id === TEST_DROP_ID) {
      clearActiveDropTimer()
      activeDrop.value = null
    }

    isTestDropActive.value = false
  }

  const skipCurrentDrop = async () => {
    await window.memedrop?.skipCurrentDrop()
  }

  const completeLocalDrop = () => {
    if (isOverlayView.value) {
      void completeActiveDrop()
    }
  }

  const stopCurrentDropForEveryone = async () => {
    await window.memedrop?.stopCurrentDropForEveryone()
  }

  const triggerTestDrop = async () => {
    if (isTestDropActive.value) {
      isTestDropActive.value = false
      await window.memedrop?.clearTestDrop()
      return
    }

    isTestDropActive.value = true
    await window.memedrop?.emitTestDrop({
      id: TEST_DROP_ID,
      url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif',
      contentType: 'image/gif',
      fileName: 'test.gif',
      caption: 'Drop de test',
      authorId: null,
      author: 'MemeDrop',
      authorAvatarUrl: null,
      createdAt: new Date().toISOString(),
    })
  }

  onBeforeUnmount(() => {
    clearActiveDropTimer()
  })

  return {
    activeDrop,
    activeKind,
    hasDrop,
    isTestDropActive,
    canStopGlobalDrop,
    completeActiveDrop,
    receiveDrop,
    clearServerDrop,
    clearTestDrop,
    skipCurrentDrop,
    completeLocalDrop,
    stopCurrentDropForEveryone,
    triggerTestDrop,
  }
}
