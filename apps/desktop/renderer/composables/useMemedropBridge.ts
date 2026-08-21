import { onBeforeUnmount, onMounted, ref, type ComputedRef } from 'vue'
import type {
  ActiveDropSnapshot,
  AppPreferences,
  AppUpdateState,
  AppVersionInfo,
  ConnectedUser,
  ConnectionStatus,
  ControlPanelSectionState,
  Drop,
  OverlayDisplayInfo,
  OverlayDisplayPreferences,
  OverlayState,
  ServerConfig,
  ShortcutConfig,
  ShortcutStatus,
} from '../../shared/types'

type DropSource = 'server' | 'test'
const INITIAL_STATE_TIMEOUT_MS = 5_000
const EVENT_BUFFER_LIMIT = 200

export type ControlInitializationStatus = 'initializing' | 'ready' | 'error'

type MemedropBridgeOptions = {
  isOverlayView: ComputedRef<boolean>
  applyOverlayState: (state: OverlayState) => void
  applyOverlayDisplayPreferences: (preferences: OverlayDisplayPreferences) => void
  setOverlayDisplays: (displays: OverlayDisplayInfo[]) => void
  setAppPreferences: (preferences: AppPreferences) => void
  setAppVersionInfo: (info: AppVersionInfo) => void
  setAppUpdateState: (state: AppUpdateState) => void
  setConnectionStatus: (status: ConnectionStatus | null) => void
  setControlPanelSectionState: (state: ControlPanelSectionState) => void
  setConnectedUsers: (users: ConnectedUser[]) => void
  setShortcutConfigs: (shortcuts: ShortcutConfig[]) => void
  setShortcutStatus: (status: ShortcutStatus[]) => void
  setServerConfig: (config: ServerConfig) => void
  receiveDrop: (drop: Drop, source?: DropSource, isPresented?: boolean) => void
  clearServerDrop: () => void
  clearTestDrop: (expectedDropId?: string) => void
  retryServerDropCompletion: (expectedDropId?: string) => void
  markServerDropNotPresented: (expectedDropId: string) => void
}

export const useMemedropBridge = ({
  isOverlayView,
  applyOverlayState,
  applyOverlayDisplayPreferences,
  setOverlayDisplays,
  setAppPreferences,
  setAppVersionInfo,
  setAppUpdateState,
  setConnectionStatus,
  setControlPanelSectionState,
  setConnectedUsers,
  setShortcutConfigs,
  setShortcutStatus,
  setServerConfig,
  receiveDrop,
  clearServerDrop,
  clearTestDrop,
  retryServerDropCompletion,
  markServerDropNotPresented,
}: MemedropBridgeOptions) => {
  const initializationStatus = ref<ControlInitializationStatus>('initializing')
  const initializationError = ref<string | null>(null)
  const unsubscribers: Array<() => void> = []
  const bufferedEvents: Array<() => void> = []
  let disposed = false
  let hydrating = false
  let hydrationGeneration = 0
  let hydrationPromise: Promise<void> | null = null

  const remember = (unsubscribe: (() => void) | undefined) => {
    if (unsubscribe) {
      unsubscribers.push(unsubscribe)
    }
  }

  const dispatchEvent = (apply: () => void) => {
    if (disposed) {
      return
    }
    if (hydrating) {
      bufferedEvents.push(apply)
      if (bufferedEvents.length > EVENT_BUFFER_LIMIT) {
        bufferedEvents.shift()
      }
      return
    }
    apply()
  }

  const applyActiveDropSnapshot = (snapshot: ActiveDropSnapshot) => {
    clearServerDrop()
    clearTestDrop()
    if (snapshot.serverDrop) {
      receiveDrop(snapshot.serverDrop, 'server', snapshot.serverDropPresented)
    } else if (snapshot.testDrop) {
      receiveDrop(snapshot.testDrop, 'test')
    }
  }

  const requestInitialState = () => {
    if (disposed) {
      return Promise.resolve()
    }
    if (hydrationPromise) {
      return hydrationPromise
    }

    if (initializationStatus.value === 'error') {
      // A retry snapshot is newer than every event buffered before it starts.
      bufferedEvents.length = 0
    }

    hydrating = true
    initializationStatus.value = 'initializing'
    initializationError.value = null
    const generation = ++hydrationGeneration

    const load = async <T>(
      label: string,
      getter: () => Promise<T>,
      apply: (value: T) => void,
    ): Promise<{ apply: () => void; error: unknown | null }> => {
      let timeout: ReturnType<typeof setTimeout> | null = null
      try {
        const value = await Promise.race([
          getter(),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error(`délai de ${INITIAL_STATE_TIMEOUT_MS} ms dépassé`)),
              INITIAL_STATE_TIMEOUT_MS,
            )
          }),
        ])
        return { apply: () => apply(value), error: null }
      } catch (error) {
        console.error(`Chargement de l'état initial « ${label} » impossible :`, error)
        return { apply: () => undefined, error }
      } finally {
        if (timeout) {
          clearTimeout(timeout)
        }
      }
    }

    const operation = (async () => {
      const loads: Array<Promise<{ apply: () => void; error: unknown | null }>> = []
      if (isOverlayView.value) {
        const overlayBridge = window.memedropOverlay
        if (overlayBridge) {
          loads.push(
            load('état de l’overlay', () => overlayBridge.getOverlayState(), applyOverlayState),
            load(
              'préférences d’affichage',
              () => overlayBridge.getOverlayDisplayPreferences(),
              applyOverlayDisplayPreferences,
            ),
            load(
              'drop actif',
              () => overlayBridge.getActiveDropSnapshot(),
              applyActiveDropSnapshot,
            ),
          )
        } else {
          console.error("Chargement de l'état initial impossible : bridge overlay absent.")
        }
      } else {
        const memedrop = window.memedrop
        if (memedrop) {
          loads.push(
            load(
              'drop actif',
              () => memedrop.getActiveDropSnapshot(),
              applyActiveDropSnapshot,
            ),
            load('état de l’overlay', () => memedrop.getOverlayState(), applyOverlayState),
            load(
              'préférences d’affichage',
              () => memedrop.getOverlayDisplayPreferences(),
              applyOverlayDisplayPreferences,
            ),
            load('écrans', () => memedrop.getOverlayDisplays(), setOverlayDisplays),
            load('préférences de l’application', () => memedrop.getAppPreferences(), setAppPreferences),
            load('version de l’application', () => memedrop.getAppVersionInfo(), setAppVersionInfo),
            load('mise à jour', () => memedrop.getAppUpdateState(), setAppUpdateState),
            load('connexion', () => memedrop.getConnectionStatus(), setConnectionStatus),
            load(
              'sections du panneau',
              () => memedrop.getControlPanelSectionState(),
              setControlPanelSectionState,
            ),
            load('utilisateurs connectés', () => memedrop.getConnectedUsers(), setConnectedUsers),
            load('raccourcis', () => memedrop.getShortcutConfigs(), setShortcutConfigs),
            load('état des raccourcis', () => memedrop.getShortcutStatus(), setShortcutStatus),
            load('configuration serveur', () => memedrop.getServerConfig(), setServerConfig),
          )
        } else {
          console.error("Chargement de l'état initial impossible : bridge de contrôle absent.")
        }
      }

      const snapshots = await Promise.all(loads)
      if (disposed || generation !== hydrationGeneration) {
        bufferedEvents.length = 0
        return
      }

      if (
        loads.length === 0 ||
        (!isOverlayView.value && snapshots.some((snapshot) => snapshot.error !== null))
      ) {
        initializationStatus.value = 'error'
        initializationError.value =
          "Une partie de l'application ne répond pas. Réessaie, ou relance MemeDrop si le problème persiste."
        return
      }

      try {
        for (const snapshot of snapshots) {
          snapshot.apply()
        }

        // Events received after subscription but before the snapshots resolved are
        // newer than those snapshots. Replay them only after every snapshot has
        // been applied so stale invoke() results can never win the race.
        const pendingEvents = bufferedEvents.splice(0)
        for (const apply of pendingEvents) {
          apply()
        }
        hydrating = false
        initializationStatus.value = 'ready'
      } catch (error) {
        console.error("Application de l'état initial impossible :", error)
        initializationStatus.value = 'error'
        initializationError.value =
          "Une partie de l'application ne répond pas. Réessaie, ou relance MemeDrop si le problème persiste."
      }
    })().finally(() => {
      if (generation === hydrationGeneration) {
        if (disposed) {
          hydrating = false
          bufferedEvents.length = 0
        }
        hydrationPromise = null
      }
    })

    hydrationPromise = operation
    return operation
  }

  const subscribe = () => {
    if (isOverlayView.value) {
      const overlayBridge = window.memedropOverlay
      if (!overlayBridge) {
        return
      }

      remember(overlayBridge.onDrop((drop) => dispatchEvent(() => receiveDrop(drop, 'server'))))
      remember(overlayBridge.onTestDrop((drop) => dispatchEvent(() => receiveDrop(drop, 'test'))))
      remember(overlayBridge.onClearDrop(() => dispatchEvent(clearServerDrop)))
      remember(
        overlayBridge.onTestDropCleared((dropId) =>
          dispatchEvent(() => clearTestDrop(dropId)),
        ),
      )
      remember(
        overlayBridge.onSkipCurrentDrop((dropId) =>
          dispatchEvent(() => retryServerDropCompletion(dropId)),
        ),
      )
      remember(overlayBridge.onOverlayState((state) => dispatchEvent(() => applyOverlayState(state))))
      remember(
        overlayBridge.onOverlayDisplayPreferences((preferences) =>
          dispatchEvent(() => applyOverlayDisplayPreferences(preferences)),
        ),
      )
      return
    }

    const memedrop = window.memedrop
    if (!memedrop) {
      return
    }

    remember(memedrop.onDrop((drop) => dispatchEvent(() => receiveDrop(drop, 'server'))))
    remember(memedrop.onTestDrop((drop) => dispatchEvent(() => receiveDrop(drop, 'test'))))
    remember(memedrop.onClearDrop(() => dispatchEvent(clearServerDrop)))
    remember(
      memedrop.onTestDropCleared((dropId) =>
        dispatchEvent(() => clearTestDrop(dropId)),
      ),
    )
    remember(
      memedrop.onSkipCurrentDrop((dropId) =>
        dispatchEvent(() => markServerDropNotPresented(dropId)),
      ),
    )
    remember(memedrop.onConnectionStatus((status) => dispatchEvent(() => setConnectionStatus(status))))
    remember(memedrop.onConnectedUsers((users) => dispatchEvent(() => setConnectedUsers(users))))
    remember(memedrop.onShortcutStatus((status) => dispatchEvent(() => setShortcutStatus(status))))
    remember(memedrop.onShortcutConfigs((shortcuts) => dispatchEvent(() => setShortcutConfigs(shortcuts))))
    remember(memedrop.onOverlayState((state) => dispatchEvent(() => applyOverlayState(state))))
    remember(
      memedrop.onOverlayDisplayPreferences((preferences) =>
        dispatchEvent(() => applyOverlayDisplayPreferences(preferences)),
      ),
    )
    remember(memedrop.onOverlayDisplays((displays) => dispatchEvent(() => setOverlayDisplays(displays))))
    remember(memedrop.onAppPreferences((preferences) => dispatchEvent(() => setAppPreferences(preferences))))
    remember(memedrop.onAppVersionInfo((info) => dispatchEvent(() => setAppVersionInfo(info))))
    remember(memedrop.onAppUpdateState((state) => dispatchEvent(() => setAppUpdateState(state))))
    remember(memedrop.onServerConfig((config) => dispatchEvent(() => setServerConfig(config))))
  }

  onMounted(() => {
    hydrating = true
    subscribe()
    void requestInitialState()
  })

  onBeforeUnmount(() => {
    disposed = true
    hydrationGeneration += 1
    hydrating = false
    bufferedEvents.length = 0
    unsubscribers.forEach((unsubscribe) => unsubscribe())
    unsubscribers.length = 0
  })

  return {
    initializationStatus,
    initializationError,
    requestInitialState,
  }
}
