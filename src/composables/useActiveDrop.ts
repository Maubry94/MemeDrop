import { computed, onBeforeUnmount, ref, type ComputedRef } from 'vue'
import { getMediaKind } from '../../shared/media'
import type { Drop, ServerConfig } from '../../shared/types'

const TEST_DROP_ID_PREFIX = 'memedrop-test-preview-'
const COMPLETION_RETRY_DELAY_MS = 2_000

type DropSource = 'server' | 'test'

type ActiveDropOptions = {
  isOverlayView: ComputedRef<boolean>
  dropsEnabled: ComputedRef<boolean>
  serverConfig: ComputedRef<ServerConfig>
}

export const useActiveDrop = ({ isOverlayView, dropsEnabled, serverConfig }: ActiveDropOptions) => {
  const serverDrop = ref<Drop | null>(null)
  const testDrop = ref<Drop | null>(null)
  const activeDrop = computed(() => serverDrop.value ?? testDrop.value)
  const disposed = ref(false)
  let completionInFlight: Promise<boolean> | null = null
  let completionInFlightKey: string | null = null
  let completionRetryTimer: ReturnType<typeof setTimeout> | null = null
  let completionRetryKey: string | null = null

  const activeKind = computed(() => getMediaKind(activeDrop.value))
  const hasDrop = computed(() => Boolean(activeDrop.value) && dropsEnabled.value)
  const isTestDropActive = computed(() => Boolean(testDrop.value))
  const canTriggerTestDrop = computed(
    () => dropsEnabled.value && (!serverDrop.value || Boolean(testDrop.value)),
  )
  const canStopGlobalDrop = computed(
    () =>
      Boolean(serverDrop.value?.id) &&
      Boolean(serverConfig.value.discordUserId) &&
      (serverDrop.value?.ownerId ?? serverDrop.value?.authorId) ===
        serverConfig.value.discordUserId,
  )

  const getCurrentDrop = (source: DropSource) =>
    source === 'server' ? serverDrop.value : testDrop.value

  const clearCompletionRetry = (key?: string) => {
    if (key && completionRetryKey !== key) {
      return
    }

    if (completionRetryTimer) {
      clearTimeout(completionRetryTimer)
      completionRetryTimer = null
    }
    completionRetryKey = null
  }

  const clearDropIfCurrent = (source: DropSource, dropId: string) => {
    if (source === 'server') {
      if (serverDrop.value?.id === dropId) {
        serverDrop.value = null
      }
    } else if (testDrop.value?.id === dropId) {
      testDrop.value = null
    }

    clearCompletionRetry(`${source}:${dropId}`)
  }

  const scheduleCompletionRetry = (source: DropSource, dropId: string) => {
    const key = `${source}:${dropId}`
    if (
      disposed.value ||
      getCurrentDrop(source)?.id !== dropId ||
      completionRetryTimer
    ) {
      return
    }

    completionRetryKey = key
    completionRetryTimer = setTimeout(() => {
      completionRetryTimer = null
      completionRetryKey = null
      if (!disposed.value && getCurrentDrop(source)?.id === dropId) {
        void completeDrop(source, dropId)
      }
    }, COMPLETION_RETRY_DELAY_MS)
  }

  const invokeDropCompletion = async (source: DropSource, dropId: string) => {
    if (source === 'test') {
      const bridge = isOverlayView.value ? window.memedropOverlay : window.memedrop
      if (!bridge) {
        throw new Error('Bridge MemeDrop indisponible pour fermer le drop de test.')
      }
      return bridge.clearTestDrop(dropId)
    }

    const bridge = isOverlayView.value ? window.memedropOverlay : window.memedrop
    if (!bridge) {
      throw new Error('Bridge MemeDrop indisponible pour acquitter le drop.')
    }
    return bridge.completeCurrentDrop(dropId)
  }

  const reconcileRejectedServerCompletion = async (dropId: string) => {
    const bridge = isOverlayView.value ? window.memedropOverlay : window.memedrop
    if (!bridge) {
      scheduleCompletionRetry('server', dropId)
      return
    }

    try {
      const snapshot = await bridge.getActiveDropSnapshot()
      if (serverDrop.value?.id !== dropId) {
        return
      }
      if (snapshot.serverDrop?.id === dropId) {
        scheduleCompletionRetry('server', dropId)
      } else {
        // Main has already cleared or replaced this ID; reconcile a renderer
        // that missed the corresponding event instead of retrying forever.
        clearDropIfCurrent('server', dropId)
      }
    } catch (error) {
      console.error(`Vérification du drop ${dropId} impossible :`, error)
      scheduleCompletionRetry('server', dropId)
    }
  }

  const completeDrop = async (source: DropSource, dropId: string): Promise<boolean> => {
    const key = `${source}:${dropId}`
    if (getCurrentDrop(source)?.id !== dropId) {
      return false
    }

    if (completionInFlight && completionInFlightKey === key) {
      return completionInFlight
    }

    const operation = (async () => {
      try {
        const accepted = await invokeDropCompletion(source, dropId)
        if (accepted) {
          clearDropIfCurrent(source, dropId)
        } else if (source === 'server') {
          // The main process could not enqueue the acknowledgement. Retain the
          // media and retry: clearing here would silently lose the only ACK.
          await reconcileRejectedServerCompletion(dropId)
        } else {
          // A rejected preview clear means main no longer owns that preview.
          clearDropIfCurrent(source, dropId)
        }
        return accepted
      } catch (error) {
        console.error(`Acquittement du drop ${dropId} impossible :`, error)
        scheduleCompletionRetry(source, dropId)
        return false
      } finally {
        if (completionInFlightKey === key) {
          completionInFlight = null
          completionInFlightKey = null
        }
      }
    })()

    completionInFlightKey = key
    completionInFlight = operation
    return operation
  }

  const completeActiveDrop = async (expectedDropId?: string) => {
    const drop = activeDrop.value
    if (!drop || (expectedDropId && drop.id !== expectedDropId)) {
      return false
    }

    const source: DropSource = serverDrop.value?.id === drop.id ? 'server' : 'test'
    return completeDrop(source, drop.id)
  }

  const receiveDrop = (drop: Drop, source: DropSource = 'server') => {
    if (source === 'test') {
      // A local preview is strictly lower priority and can never displace a real
      // server drop, including during bootstrap replay.
      if (serverDrop.value) {
        return
      }
      if (testDrop.value?.id === drop.id) {
        return
      }
      clearCompletionRetry()
      testDrop.value = drop
    } else {
      if (serverDrop.value?.id === drop.id) {
        return
      }
      clearCompletionRetry()
      testDrop.value = null
      serverDrop.value = drop
    }

    if (!isOverlayView.value) {
      return
    }

    if (!dropsEnabled.value || getMediaKind(drop) === 'file') {
      void completeDrop(source, drop.id)
    }
  }

  const clearServerDrop = () => {
    const dropId = serverDrop.value?.id
    serverDrop.value = null
    if (dropId) {
      clearCompletionRetry(`server:${dropId}`)
    }
  }

  const clearTestDrop = (expectedDropId?: string) => {
    if (expectedDropId && testDrop.value?.id !== expectedDropId) {
      return
    }

    const dropId = testDrop.value?.id
    testDrop.value = null
    if (dropId) {
      clearCompletionRetry(`test:${dropId}`)
    }
  }

  const skipCurrentDrop = async () => {
    try {
      const accepted = await window.memedrop?.skipCurrentDrop()
      return accepted ?? false
    } catch (error) {
      console.error('Impossible de passer le drop courant :', error)
      return false
    }
  }

  const completeLocalDrop = () => {
    if (isOverlayView.value) {
      void completeActiveDrop()
    }
  }

  const retryServerDropCompletion = () => {
    const dropId = serverDrop.value?.id
    if (isOverlayView.value && dropId) {
      void completeDrop('server', dropId)
    }
  }

  const stopCurrentDropForEveryone = async () => {
    await window.memedrop?.stopCurrentDropForEveryone()
  }

  const triggerTestDrop = async () => {
    if (serverDrop.value) {
      return false
    }

    const currentTestDrop = testDrop.value
    if (currentTestDrop) {
      try {
        const accepted = await window.memedrop?.clearTestDrop(currentTestDrop.id)
        clearDropIfCurrent('test', currentTestDrop.id)
        return accepted ?? false
      } catch (error) {
        console.error('Impossible de fermer le drop de test :', error)
        return false
      }
    }

    const preview: Drop = {
      id: `${TEST_DROP_ID_PREFIX}${crypto.randomUUID()}`,
      url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif',
      contentType: 'image/gif',
      fileName: 'test.gif',
      caption: 'Drop de test',
      authorId: null,
      author: 'MemeDrop',
      authorAvatarUrl: null,
      createdAt: new Date().toISOString(),
    }

    try {
      const accepted = await window.memedrop?.emitTestDrop(preview)
      if (accepted && !serverDrop.value) {
        testDrop.value = preview
      }
      return accepted ?? false
    } catch (error) {
      console.error('Impossible de lancer le drop de test :', error)
      return false
    }
  }

  onBeforeUnmount(() => {
    disposed.value = true
    clearCompletionRetry()
  })

  return {
    activeDrop,
    activeKind,
    hasDrop,
    isTestDropActive,
    canTriggerTestDrop,
    canStopGlobalDrop,
    completeActiveDrop,
    receiveDrop,
    clearServerDrop,
    clearTestDrop,
    skipCurrentDrop,
    completeLocalDrop,
    retryServerDropCompletion,
    stopCurrentDropForEveryone,
    triggerTestDrop,
  }
}
