import { computed, ref, type ComputedRef } from 'vue'
import { getMediaKind } from '../../shared/media'
import type { Drop, ServerConfig } from '../../shared/types'

const TEST_DROP_ID = 'memedrop-test-preview'

type ActiveDropOptions = {
  isOverlayView: ComputedRef<boolean>
  dropsEnabled: ComputedRef<boolean>
  serverConfig: ComputedRef<ServerConfig>
}

export const useActiveDrop = ({ isOverlayView, dropsEnabled, serverConfig }: ActiveDropOptions) => {
  const isTestDropActive = ref(false)
  const activeDrop = ref<Drop | null>(null)

  const activeKind = computed(() => getMediaKind(activeDrop.value))
  const hasDrop = computed(() => Boolean(activeDrop.value) && dropsEnabled.value)
  const canStopGlobalDrop = computed(
    () =>
      Boolean(activeDrop.value?.id) &&
      Boolean(serverConfig.value.discordUserId) &&
      (activeDrop.value?.ownerId ?? activeDrop.value?.authorId) === serverConfig.value.discordUserId,
  )

  const completeActiveDrop = async (expectedDropId?: string) => {
    const drop = activeDrop.value
    if (!drop) {
      return
    }

    if (expectedDropId && drop.id !== expectedDropId) {
      return
    }

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
  }

  const clearServerDrop = () => {
    if (activeDrop.value?.id === TEST_DROP_ID) {
      return
    }

    activeDrop.value = null
  }

  const clearTestDrop = () => {
    if (activeDrop.value?.id === TEST_DROP_ID) {
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
