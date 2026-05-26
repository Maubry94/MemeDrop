<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ControlPanel from './components/control/ControlPanel.vue'
import LoginView from './components/control/LoginView.vue'
import DropOverlay from './components/overlay/DropOverlay.vue'
import { getMediaKind } from './shared/media'
import type { ConnectionStatus, Drop, OverlayState, ServerConfig } from './shared/types'

type OverlayPosition = 'full' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type AppView = 'overlay' | 'control'

const STORAGE_KEYS = {
  position: 'memedrop.overlay.position',
  volume: 'memedrop.overlay.volume',
}

const viewParam = new URLSearchParams(window.location.search).get('view')
const view: AppView = viewParam === 'control' ? 'control' : 'overlay'
const isOverlayView = computed(() => view === 'overlay')
const isControlView = computed(() => view === 'control')

const overlayPosition = ref<OverlayPosition>(
  (localStorage.getItem(STORAGE_KEYS.position) as OverlayPosition) ?? 'full',
)
const dropVolume = ref(Number(localStorage.getItem(STORAGE_KEYS.volume) ?? '80'))
const dropsEnabled = ref(true)
const hideOwnDrops = ref(false)
const activeDrop = ref<Drop | null>(null)
const connectionStatus = ref<ConnectionStatus | null>(null)
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
  await window.memedrop?.completeCurrentDrop(drop.id)
}

const scheduleActiveDrop = () => {
  clearActiveDropTimer()
  if (!activeDrop.value || !isOverlayView.value) {
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

const requestConnectionStatus = async () => {
  if (!window.memedrop) {
    return
  }
  connectionStatus.value = await window.memedrop.getConnectionStatus()
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
  await window.memedrop?.emitTestDrop({
    id: crypto.randomUUID(),
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
}

watch(overlayPosition, (value) => {
  localStorage.setItem(STORAGE_KEYS.position, value)
})

watch(dropVolume, (value) => {
  localStorage.setItem(STORAGE_KEYS.volume, String(value))
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
  await requestConnectionStatus()
  await requestServerConfig()
  window.addEventListener('storage', handleStorage)

  const unsubDrop = window.memedrop?.onDrop((drop) => {
    activeDrop.value = drop

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
    clearActiveDropTimer()
    activeDrop.value = null
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

  if (unsubDrop) unsubscribers.push(unsubDrop)
  if (unsubClearDrop) unsubscribers.push(unsubClearDrop)
  if (unsubSkipCurrentDrop) unsubscribers.push(unsubSkipCurrentDrop)
  if (unsubStatus) unsubscribers.push(unsubStatus)
  if (unsubOverlay) unsubscribers.push(unsubOverlay)
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
        :volume="dropVolume"
        @advance="completeActiveDrop"
      />
    </div>

    <div
      v-else
      class="flex h-full w-full flex-col gap-4 overflow-y-auto bg-slate-950 p-4 text-sm text-slate-100"
    >
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold">MemeDrop</span>
      </div>

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
        :overlay-position="overlayPosition"
        :is-saving-config="isSavingConfig"
        :config-saved-message="configSavedMessage"
        :auth-message="discordAuthMessage"
        :connection-status="connectionStatus"
        @toggle-drops="toggleDrops"
        @skip-current-drop="skipCurrentDrop"
        @toggle-hide-own-drops="toggleHideOwnDrops"
        @stop-current-drop-for-everyone="stopCurrentDropForEveryone"
        @update-drop-volume="dropVolume = $event"
        @update-overlay-position="overlayPosition = $event as OverlayPosition"
        @save-server-config="saveServerConfig"
        @disconnect-discord="disconnectDiscord"
        @trigger-test-drop="triggerTestDrop"
      />
    </div>
  </div>
</template>
