<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  ConnectionStatus,
  Drop,
  OverlayState,
  ServerConfig,
  ShortcutStatus,
} from './shared/types'

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
const queue = ref<Drop[]>([])
const videoElement = ref<HTMLVideoElement | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const connectionStatus = ref<ConnectionStatus | null>(null)
const shortcutStatus = ref<ShortcutStatus[]>([])
const serverConfig = ref<ServerConfig>({
  serverUrl: '',
  accessKey: '',
})
const configSavedMessage = ref<string | null>(null)
const isSavingConfig = ref(false)
const unsubscribers: Array<() => void> = []

const DISPLAY_MS = 9000
let queueTimer: number | undefined
let syncingState = false

const activeDrop = computed(() => queue.value[0] ?? null)
const hasDrop = computed(() => Boolean(activeDrop.value) && dropsEnabled.value)
const normalizedDropVolume = computed(() => Math.min(Math.max(dropVolume.value, 0), 100) / 100)

const applyDropVolume = () => {
  if (videoElement.value) {
    videoElement.value.volume = normalizedDropVolume.value
  }

  if (audioElement.value) {
    audioElement.value.volume = normalizedDropVolume.value
  }
}

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

const activeKind = computed(() => getMediaKind(activeDrop.value))

const clearQueueTimer = () => {
  if (queueTimer) {
    window.clearTimeout(queueTimer)
    queueTimer = undefined
  }
}

const advanceQueue = () => {
  clearQueueTimer()
  queue.value.shift()
  scheduleCurrentDrop()
}

const scheduleCurrentDrop = () => {
  clearQueueTimer()
  if (!queue.value.length) {
    return
  }

  if (['video', 'audio'].includes(activeKind.value)) {
    return
  }

  queueTimer = window.setTimeout(() => {
    advanceQueue()
  }, DISPLAY_MS)
}

const enqueue = (drop: Drop) => {
  queue.value.push(drop)
  if (queue.value.length === 1) {
    scheduleCurrentDrop()
  }
}

const applyOverlayState = (state: OverlayState) => {
  syncingState = true
  dropsEnabled.value = state.dropsEnabled
  syncingState = false
}

const requestOverlayState = async () => {
  if (!window.memedrop) {
    return
  }
  const state = await window.memedrop.getOverlayState()
  applyOverlayState(state)
}

const requestConnectionStatus = async () => {
  if (!window.memedrop) {
    return
  }
  connectionStatus.value = await window.memedrop.getConnectionStatus()
}

const requestShortcutStatus = async () => {
  if (!window.memedrop) {
    return
  }
  shortcutStatus.value = await window.memedrop.getShortcutStatus()
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
    const configToSave: ServerConfig = {
      serverUrl: serverConfig.value.serverUrl,
      accessKey: serverConfig.value.accessKey,
    }

    serverConfig.value = await window.memedrop.saveServerConfig(configToSave)
    configSavedMessage.value = 'Configuration enregistrée.'
  } catch (error) {
    console.error('Enregistrement serveur impossible:', error)
    configSavedMessage.value = 'Enregistrement impossible.'
  } finally {
    isSavingConfig.value = false
  }
}

const toggleDrops = async () => {
  const state = await window.memedrop?.toggleDrops()
  if (state) {
    applyOverlayState(state)
  }
}

const skipCurrentDrop = async () => {
  await window.memedrop?.skipCurrentDrop()
}

const triggerTestDrop = async () => {
  await window.memedrop?.emitTestDrop({
    id: crypto.randomUUID(),
    url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif',
    contentType: 'image/gif',
    fileName: 'test.gif',
    caption: 'Drop de test (dev)',
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
  applyDropVolume()
})

watch(dropsEnabled, async (value) => {
  if (!value) {
    queue.value = []
    clearQueueTimer()
  }

  if (syncingState || !isControlView.value) {
    return
  }
  await window.memedrop?.setDropsEnabled(value)
})

onMounted(async () => {
  await requestOverlayState()
  await requestConnectionStatus()
  await requestShortcutStatus()
  await requestServerConfig()
  window.addEventListener('storage', handleStorage)

  const unsubDrop = window.memedrop?.onDrop((drop) => {
    if (!isOverlayView.value || !dropsEnabled.value) {
      return
    }
    enqueue(drop)
  })

  const unsubSkipCurrentDrop = window.memedrop?.onSkipCurrentDrop(() => {
    if (!isOverlayView.value) {
      return
    }
    advanceQueue()
  })

  const unsubStatus = window.memedrop?.onConnectionStatus((status) => {
    connectionStatus.value = status
  })

  const unsubShortcutStatus = window.memedrop?.onShortcutStatus((status) => {
    shortcutStatus.value = status
  })

  const unsubOverlay = window.memedrop?.onOverlayState((state) => {
    applyOverlayState(state)
  })

  if (unsubDrop) unsubscribers.push(unsubDrop)
  if (unsubSkipCurrentDrop) unsubscribers.push(unsubSkipCurrentDrop)
  if (unsubStatus) unsubscribers.push(unsubStatus)
  if (unsubShortcutStatus) unsubscribers.push(unsubShortcutStatus)
  if (unsubOverlay) unsubscribers.push(unsubOverlay)
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', handleStorage)
  clearQueueTimer()
  unsubscribers.forEach((unsubscribe) => unsubscribe())
})

const getMediaKind = (drop: Drop | null) => {
  if (!drop) {
    return 'none'
  }

  const type = drop.contentType?.toLowerCase() ?? ''
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'

  const ext = drop.fileName?.split('.').pop()?.toLowerCase()
  if (!ext) {
    return 'file'
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return 'audio'
  return 'file'
}
</script>

<template>
  <div class="h-full w-full">
    <div v-if="isOverlayView" class="relative h-full w-full">
      <div class="pointer-events-none absolute inset-0 flex" :class="overlayClasses">
        <div
          v-if="hasDrop"
          class="pointer-events-none w-full max-w-[min(880px,90vw)] rounded-3xl border border-overlay-border bg-overlay-bg p-6 backdrop-blur"
        >
          <div class="flex flex-col gap-4">
            <img
              v-if="activeKind === 'image'"
              :src="activeDrop?.url"
              :alt="activeDrop?.caption ?? 'MemeDrop image'"
              class="max-h-[60vh] w-full rounded-2xl object-contain"
            />
            <video
              v-else-if="activeKind === 'video'"
              ref="videoElement"
              :key="`video-${activeDrop?.id}`"
              :src="activeDrop?.url"
              autoplay
              playsinline
              class="max-h-[60vh] w-full rounded-2xl object-contain"
              @loadedmetadata="applyDropVolume"
              @ended="advanceQueue"
              @error="advanceQueue"
            />
            <audio
              v-else-if="activeKind === 'audio'"
              ref="audioElement"
              :key="`audio-${activeDrop?.id}`"
              :src="activeDrop?.url"
              autoplay
              controls
              @loadedmetadata="applyDropVolume"
              @ended="advanceQueue"
              @error="advanceQueue"
            />
          </div>

          <div v-if="activeDrop?.caption || activeDrop?.author" class="mt-4 space-y-3">
            <p v-if="activeDrop?.caption" class="text-2xl font-semibold text-slate-100">
              {{ activeDrop?.caption }}
            </p>
            <div v-if="activeDrop?.author" class="flex items-center gap-3 text-base text-slate-300">
              <img
                v-if="activeDrop?.authorAvatarUrl"
                :src="activeDrop.authorAvatarUrl"
                :alt="`Avatar Discord de ${activeDrop.author}`"
                class="h-10 w-10 shrink-0 rounded-full border border-white/20 bg-slate-800 object-cover"
              />
              <div
                v-else
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-800 text-sm font-semibold text-slate-200"
              >
                {{ activeDrop.author.slice(0, 1).toUpperCase() }}
              </div>
              <span>Envoyé par {{ activeDrop.author }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex h-full w-full flex-col gap-4 bg-slate-950 p-4 text-sm text-slate-100">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold">MemeDrop</span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/90"
          @click="toggleDrops"
        >
          {{ dropsEnabled ? 'Désactiver' : 'Activer' }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/90"
          @click="skipCurrentDrop"
        >
          Couper
        </button>
      </div>

      <label class="flex flex-col gap-1 text-xs text-slate-300">
        Position de l’overlay
        <select
          v-model="overlayPosition"
          class="w-full rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-sm text-slate-100"
        >
          <option value="full">Plein écran (centré)</option>
          <option value="top-left">Haut gauche</option>
          <option value="top-right">Haut droite</option>
          <option value="bottom-left">Bas gauche</option>
          <option value="bottom-right">Bas droite</option>
        </select>
      </label>

      <label class="flex flex-col gap-2 text-xs text-slate-300">
        <span class="flex items-center justify-between gap-2">
          Volume des drops
          <span class="text-[11px] text-slate-400">{{ dropVolume }}%</span>
        </span>
        <input
          v-model.number="dropVolume"
          type="range"
          min="0"
          max="100"
          step="5"
          class="w-full accent-sky-400"
        />
      </label>

      <form class="flex flex-col gap-3" @submit.prevent="saveServerConfig">
        <label class="flex flex-col gap-1 text-xs text-slate-300">
          URL du serveur
          <input
            v-model="serverConfig.serverUrl"
            type="url"
            placeholder="https://memedrop.example.com"
            class="w-full rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-sm text-slate-100"
          />
        </label>

        <label class="flex flex-col gap-1 text-xs text-slate-300">
          Clé d'accès
          <input
            v-model="serverConfig.accessKey"
            type="password"
            autocomplete="off"
            class="w-full rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-sm text-slate-100"
          />
        </label>

        <button
          type="submit"
          class="w-full rounded-lg border border-white/10 bg-sky-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-300"
          :disabled="isSavingConfig"
        >
          {{ isSavingConfig ? 'Enregistrement…' : 'Enregistrer le serveur' }}
        </button>

        <div v-if="configSavedMessage" class="text-[11px] text-slate-300">
          {{ configSavedMessage }}
        </div>
      </form>

      <div
        class="text-[11px]"
        :class="connectionStatus?.level === 'error' ? 'text-rose-300' : 'text-emerald-300'"
      >
        {{ connectionStatus?.message ?? 'Serveur MemeDrop: en attente de connexion…' }}
      </div>

      <div class="rounded-lg border border-white/10 bg-slate-900/70 p-2 text-[11px] text-slate-300">
        Ctrl+Shift+D (désactiver les drop)<br>Ctrl+Shift+S (couper le drop actuel)
      </div>

      <button
        type="button"
        class="mt-auto w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/90"
        @click="triggerTestDrop"
      >
        Tester un drop
      </button>
    </div>
  </div>
</template>
