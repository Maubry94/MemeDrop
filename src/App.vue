<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import ControlPanel from './components/control/ControlPanel.vue'
import LoginView from './components/control/LoginView.vue'
import PreferencesModal from './components/control/PreferencesModal.vue'
import DropOverlay from './components/overlay/DropOverlay.vue'
import { getMediaKind } from './shared/media'
import type {
  AppPreferences,
  ConnectionStatus,
  Drop,
  OverlayState,
  ServerConfig,
} from './shared/types'

type OverlayAnchor = 'full' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type OverlayPosition = OverlayAnchor | 'custom'
type AppView = 'overlay' | 'control'

const STORAGE_KEYS = {
  position: 'memedrop.overlay.position',
  volume: 'memedrop.overlay.volume',
  size: 'memedrop.overlay.size',
  customX: 'memedrop.overlay.customX',
  customY: 'memedrop.overlay.customY',
  customAnchor: 'memedrop.overlay.customAnchor',
}
const TEST_DROP_ID = 'memedrop-test-preview'

const viewParam = new URLSearchParams(window.location.search).get('view')
const view: AppView = viewParam === 'control' ? 'control' : 'overlay'
const isOverlayView = computed(() => view === 'overlay')
const isControlView = computed(() => view === 'control')

const overlayPosition = ref<OverlayPosition>(
  (localStorage.getItem(STORAGE_KEYS.position) as OverlayPosition) ?? 'full',
)
const dropVolume = ref(Number(localStorage.getItem(STORAGE_KEYS.volume) ?? '80'))
const dropSize = ref(Number(localStorage.getItem(STORAGE_KEYS.size) ?? '100'))
const customX = ref(Number(localStorage.getItem(STORAGE_KEYS.customX) ?? '50'))
const customY = ref(Number(localStorage.getItem(STORAGE_KEYS.customY) ?? '50'))
const customAnchor = ref<OverlayAnchor>(
  (localStorage.getItem(STORAGE_KEYS.customAnchor) as OverlayAnchor) ?? 'full',
)
const dropsEnabled = ref(true)
const hideOwnDrops = ref(false)
const isPreferencesOpen = ref(false)
const isTestDropActive = ref(false)
const activeDrop = ref<Drop | null>(null)
const connectionStatus = ref<ConnectionStatus | null>(null)
const appPreferences = ref<AppPreferences>({
  minimizeToTray: false,
  openAtLogin: false,
})
const serverConfig = ref<ServerConfig>({
  serverUrl: '',
  accessKey: '',
  discordUserId: '',
  discordUserName: '',
  discordUserAvatarUrl: null,
})
const configSavedMessage = ref<string | null>(null)
const isSavingConfig = ref(false)
const discordAuthMessage = ref<string | null>(null)
const isAuthenticatingDiscord = ref(false)
const unsubscribers: Array<() => void> = []

const DISPLAY_MS = 9000
let activeDropTimer: number | undefined
let syncingState = false

const activeKind = computed(() => getMediaKind(activeDrop.value))
const hasDrop = computed(() => Boolean(activeDrop.value) && dropsEnabled.value)
const isDiscordConnected = computed(() => Boolean(serverConfig.value.discordUserId))
const canStopGlobalDrop = computed(
  () =>
    Boolean(activeDrop.value?.id) &&
    Boolean(serverConfig.value.discordUserId) &&
    activeDrop.value?.authorId === serverConfig.value.discordUserId,
)

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

  const anchorTransforms: Record<OverlayAnchor, string> = {
    full: 'translate(-50%, -50%)',
    'top-left': 'translate(0, 0)',
    'top-right': 'translate(-100%, 0)',
    'bottom-left': 'translate(0, -100%)',
    'bottom-right': 'translate(-100%, -100%)',
  }

  return {
    left: `${customX.value}%`,
    top: `${customY.value}%`,
    transform: anchorTransforms[customAnchor.value] ?? anchorTransforms.full,
  }
})

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
  await window.memedrop?.completeCurrentDrop(drop.id)
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

const applyOverlayState = (state: OverlayState) => {
  syncingState = true
  dropsEnabled.value = state.dropsEnabled
  hideOwnDrops.value = state.hideOwnDrops
  syncingState = false
}

const requestOverlayState = async () => {
  if (!window.memedrop) {
    return
  }
  applyOverlayState(await window.memedrop.getOverlayState())
}

const requestAppPreferences = async () => {
  if (!window.memedrop) {
    return
  }
  appPreferences.value = await window.memedrop.getAppPreferences()
}

const requestConnectionStatus = async () => {
  if (!window.memedrop) {
    return
  }
  connectionStatus.value = await window.memedrop.getConnectionStatus()
}

const updateAppPreferences = async (preferences: AppPreferences) => {
  if (!window.memedrop) {
    return
  }

  appPreferences.value = await window.memedrop.setAppPreferences(preferences)
}

const uninstallApp = async () => {
  const confirmed = window.confirm(
    'Désinstaller MemeDrop ? L’application va lancer le programme de désinstallation Windows.',
  )

  if (!confirmed) {
    return
  }

  try {
    await window.memedrop?.uninstallApp()
  } catch (error) {
    window.alert(
      error instanceof Error
        ? error.message
        : "La désinstallation n'a pas pu être lancée.",
    )
  }
}

const requestServerConfig = async () => {
  if (!window.memedrop) {
    return
  }
  serverConfig.value = await window.memedrop.getServerConfig()
}

const saveServerConfig = async () => {
  if (!window.memedrop) {
    return
  }

  isSavingConfig.value = true
  configSavedMessage.value = null

  try {
    serverConfig.value = await window.memedrop.saveServerConfig({ ...serverConfig.value })
    configSavedMessage.value = 'Configuration enregistrée.'
  } catch (error) {
    console.error('Enregistrement serveur impossible:', error)
    configSavedMessage.value = 'Enregistrement impossible.'
  } finally {
    isSavingConfig.value = false
  }
}

const authenticateDiscord = async () => {
  if (!window.memedrop) {
    return
  }

  isAuthenticatingDiscord.value = true
  discordAuthMessage.value = 'Connexion Discord en cours...'

  try {
    serverConfig.value = await window.memedrop.saveServerConfig({ ...serverConfig.value })
    serverConfig.value = await window.memedrop.authenticateDiscord()
    discordAuthMessage.value = `Connecté avec Discord: ${serverConfig.value.discordUserName}`
  } catch (error) {
    console.error('Connexion Discord impossible:', error)
    discordAuthMessage.value =
      error instanceof Error
        ? `Connexion Discord impossible: ${error.message}`
        : 'Connexion Discord impossible.'
  } finally {
    isAuthenticatingDiscord.value = false
  }
}

const disconnectDiscord = async () => {
  if (!window.memedrop) {
    return
  }

  serverConfig.value = await window.memedrop.disconnectDiscord()
  discordAuthMessage.value = null
}

const toggleDrops = async () => {
  const state = await window.memedrop?.toggleDrops()
  if (state) {
    applyOverlayState(state)
  }
}

const toggleHideOwnDrops = async () => {
  const state = await window.memedrop?.toggleHideOwnDrops()
  if (state) {
    applyOverlayState(state)
  }
}

const skipCurrentDrop = async () => {
  await window.memedrop?.skipCurrentDrop()
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
    caption: 'Drop de test (dev)',
    authorId: null,
    author: 'MemeDrop',
    authorAvatarUrl: null,
    createdAt: new Date().toISOString(),
  })
}

const handleStorage = (event: StorageEvent) => {
  if (event.key === STORAGE_KEYS.position) {
    overlayPosition.value = (event.newValue as OverlayPosition) ?? 'bottom-right'
  }

  if (event.key === STORAGE_KEYS.volume) {
    dropVolume.value = Number(event.newValue ?? '80')
  }

  if (event.key === STORAGE_KEYS.size) {
    dropSize.value = Number(event.newValue ?? '100')
  }

  if (event.key === STORAGE_KEYS.customX) {
    customX.value = Number(event.newValue ?? '50')
  }

  if (event.key === STORAGE_KEYS.customY) {
    customY.value = Number(event.newValue ?? '50')
  }

  if (event.key === STORAGE_KEYS.customAnchor) {
    customAnchor.value = (event.newValue as OverlayAnchor) ?? 'full'
  }
}

watch(overlayPosition, (value) => {
  localStorage.setItem(STORAGE_KEYS.position, value)
})

watch(dropVolume, (value) => {
  localStorage.setItem(STORAGE_KEYS.volume, String(value))
})

watch(dropSize, (value) => {
  localStorage.setItem(STORAGE_KEYS.size, String(value))
})

watch(customX, (value) => {
  localStorage.setItem(STORAGE_KEYS.customX, String(value))
})

watch(customY, (value) => {
  localStorage.setItem(STORAGE_KEYS.customY, String(value))
})

watch(customAnchor, (value) => {
  localStorage.setItem(STORAGE_KEYS.customAnchor, value)
})

watch(dropsEnabled, async (value) => {
  if (!value) {
    void completeActiveDrop()
  }

  if (syncingState || !isControlView.value) {
    return
  }
  await window.memedrop?.setDropsEnabled(value)
})

onMounted(async () => {
  await requestOverlayState()
  await requestAppPreferences()
  await requestConnectionStatus()
  await requestServerConfig()
  window.addEventListener('storage', handleStorage)

  const unsubDrop = window.memedrop?.onDrop((drop) => {
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
  })

  const unsubClearDrop = window.memedrop?.onClearDrop(() => {
    if (activeDrop.value?.id === TEST_DROP_ID) {
      return
    }

    clearActiveDropTimer()
    activeDrop.value = null
  })

  const unsubTestDropCleared = window.memedrop?.onTestDropCleared(() => {
    if (activeDrop.value?.id !== TEST_DROP_ID) {
      return
    }

    clearActiveDropTimer()
    activeDrop.value = null
    isTestDropActive.value = false
  })

  const unsubSkipCurrentDrop = window.memedrop?.onSkipCurrentDrop(() => {
    if (isOverlayView.value) {
      void completeActiveDrop()
    }
  })

  const unsubStatus = window.memedrop?.onConnectionStatus((status) => {
    connectionStatus.value = status
  })

  const unsubOverlay = window.memedrop?.onOverlayState((state) => {
    applyOverlayState(state)
  })

  const unsubAppPreferences = window.memedrop?.onAppPreferences((preferences) => {
    appPreferences.value = preferences
  })

  if (unsubDrop) unsubscribers.push(unsubDrop)
  if (unsubClearDrop) unsubscribers.push(unsubClearDrop)
  if (unsubTestDropCleared) unsubscribers.push(unsubTestDropCleared)
  if (unsubSkipCurrentDrop) unsubscribers.push(unsubSkipCurrentDrop)
  if (unsubStatus) unsubscribers.push(unsubStatus)
  if (unsubOverlay) unsubscribers.push(unsubOverlay)
  if (unsubAppPreferences) unsubscribers.push(unsubAppPreferences)
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', handleStorage)
  clearActiveDropTimer()
  unsubscribers.forEach((unsubscribe) => unsubscribe())
})
</script>

<template>
  <div class="h-full w-full">
    <div v-if="isOverlayView" class="relative h-full w-full">
      <DropOverlay
        :active-drop="activeDrop"
        :active-kind="activeKind"
        :has-drop="hasDrop"
        :overlay-classes="overlayClasses"
        :custom-style="overlayCustomStyle"
        :volume="dropVolume"
        :size="dropSize"
        :is-custom-position="overlayPosition === 'custom'"
        @advance="completeActiveDrop"
      />
    </div>

    <div
      v-else
      class="flex h-full w-full flex-col gap-4 overflow-y-auto bg-slate-950 p-4 text-sm text-slate-100"
    >
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold">MemeDrop</span>
        <button
          type="button"
          class="rounded-md border border-white/10 bg-slate-900/70 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-900"
          @click="isPreferencesOpen = true"
        >
          Préférences
        </button>
      </div>

      <PreferencesModal
        v-if="isPreferencesOpen"
        :preferences="appPreferences"
        @close="isPreferencesOpen = false"
        @update-preferences="updateAppPreferences"
        @uninstall-app="uninstallApp"
      />

      <LoginView
        v-if="!isDiscordConnected"
        v-model="serverConfig"
        :is-authenticating="isAuthenticatingDiscord"
        :auth-message="discordAuthMessage"
        :is-saving-config="isSavingConfig"
        :config-saved-message="configSavedMessage"
        @authenticate="authenticateDiscord"
        @save-server-config="saveServerConfig"
      />

      <ControlPanel
        v-else
        v-model:server-config="serverConfig"
        :drops-enabled="dropsEnabled"
        :hide-own-drops="hideOwnDrops"
        :can-stop-global-drop="canStopGlobalDrop"
        :drop-volume="dropVolume"
        :drop-size="dropSize"
        :is-test-drop-active="isTestDropActive"
        :overlay-position="overlayPosition"
        :custom-x="customX"
        :custom-y="customY"
        :custom-anchor="customAnchor"
        :is-saving-config="isSavingConfig"
        :config-saved-message="configSavedMessage"
        :auth-message="discordAuthMessage"
        :connection-status="connectionStatus"
        @toggle-drops="toggleDrops"
        @skip-current-drop="skipCurrentDrop"
        @toggle-hide-own-drops="toggleHideOwnDrops"
        @stop-current-drop-for-everyone="stopCurrentDropForEveryone"
        @update-drop-volume="dropVolume = $event"
        @update-drop-size="dropSize = $event"
        @update-overlay-position="overlayPosition = $event as OverlayPosition"
        @update-custom-x="customX = $event"
        @update-custom-y="customY = $event"
        @update-custom-anchor="customAnchor = $event as OverlayAnchor"
        @save-server-config="saveServerConfig"
        @disconnect-discord="disconnectDiscord"
        @trigger-test-drop="triggerTestDrop"
      />
    </div>
  </div>
</template>
