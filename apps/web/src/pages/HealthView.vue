<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import StatusDot from '../components/StatusDot.vue'
import {
  getHealthPresentation,
  parseHealthPayload,
  type HealthPayload,
  type HealthPresentation,
} from '../lib/health'

const REFRESH_INTERVAL_MS = 30_000
const REQUEST_TIMEOUT_MS = 5_000

const payload = ref<HealthPayload | null>(null)
const hasResult = ref(false)
const isRefreshing = ref(false)
const checkedAt = ref<Date | null>(null)
const failureDetail = ref<string | null>(null)
let refreshTimer: number | null = null
let activeController: AbortController | null = null
let isMounted = false

const loadingPresentation: HealthPresentation = {
  state: 'unavailable',
  title: 'Vérification des services…',
  description: 'Connexion au serveur MemeDrop en cours.',
  tone: 'neutral',
  server: { label: 'Vérification', tone: 'neutral' },
  discord: { label: 'Vérification', tone: 'neutral' },
  clients: '—',
  version: '—',
}

const presentation = computed(() =>
  hasResult.value ? getHealthPresentation(payload.value) : loadingPresentation,
)

const checkedAtLabel = computed(() => checkedAt.value?.toLocaleString('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'medium',
}) ?? 'Pas encore vérifié')

const toneClasses = computed(() => ({
  success: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
  warning: 'border-amber-300/20 bg-amber-400/10 text-amber-100',
  danger: 'border-rose-300/20 bg-rose-400/10 text-rose-100',
  neutral: 'border-slate-600 bg-slate-800/70 text-slate-200',
})[presentation.value.tone])

const refreshHealth = async () => {
  if (isRefreshing.value) {
    return
  }

  isRefreshing.value = true
  failureDetail.value = null
  const controller = new AbortController()
  activeController = controller
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch('/health.json', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Réponse HTTP ${response.status}`)
    }

    const parsedPayload = parseHealthPayload(await response.json() as unknown)
    if (!parsedPayload) {
      throw new Error('Réponse de statut invalide')
    }

    if (isMounted) {
      payload.value = parsedPayload
    }
  } catch (error) {
    if (isMounted) {
      payload.value = null
      failureDetail.value = controller.signal.aborted
        ? 'Le serveur n’a pas répondu dans les 5 secondes.'
        : error instanceof Error
          ? error.message
          : 'La vérification a échoué.'
    }
  } finally {
    window.clearTimeout(timeoutId)
    if (activeController === controller) {
      activeController = null
    }
    if (isMounted) {
      checkedAt.value = new Date()
      hasResult.value = true
      isRefreshing.value = false
    }
  }
}

onMounted(() => {
  isMounted = true
  void refreshHealth()
  refreshTimer = window.setInterval(() => void refreshHealth(), REFRESH_INTERVAL_MS)
})

onBeforeUnmount(() => {
  isMounted = false
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer)
  }
  activeController?.abort()
})
</script>

<template>
  <div class="page-container py-12 sm:py-16 lg:py-20">
    <header class="max-w-3xl">
      <p class="eyebrow">État des services</p>
      <h1 class="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">MemeDrop en temps réel.</h1>
      <p class="mt-5 text-base leading-7 text-slate-300">
        Cette page vérifie le serveur toutes les 30 secondes. Elle reste disponible pendant un redémarrage du backend.
      </p>
    </header>

    <section class="surface-card mt-9 overflow-hidden" aria-labelledby="overall-status-title">
      <div class="flex flex-col gap-5 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div
          class="min-w-0"
          :role="presentation.tone === 'danger' ? 'alert' : 'status'"
          :aria-live="presentation.tone === 'danger' ? 'assertive' : 'polite'"
          aria-atomic="true"
        >
          <div class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold" :class="toneClasses">
            <StatusDot :tone="presentation.tone" />
            {{ presentation.title }}
          </div>
          <h2 id="overall-status-title" class="sr-only">État global</h2>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{{ presentation.description }}</p>
          <p v-if="failureDetail" class="mt-1 text-xs leading-5 text-rose-300">{{ failureDetail }}</p>
        </div>

        <button
          type="button"
          class="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-100 transition-colors hover:bg-slate-800 disabled:opacity-60 motion-reduce:transition-none"
          :disabled="isRefreshing"
          :aria-busy="isRefreshing"
          @click="refreshHealth"
        >
          <svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
            <path d="M16 8a6 6 0 1 0 .25 3.75M16 4v4h-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ isRefreshing ? 'Vérification…' : 'Actualiser' }}
        </button>
      </div>

      <dl class="grid sm:grid-cols-2 lg:grid-cols-4">
        <div class="border-b border-white/10 p-5 sm:border-r lg:border-b-0">
          <dt class="text-xs font-bold uppercase tracking-wider text-slate-400">Serveur MemeDrop</dt>
          <dd class="mt-3 flex items-center gap-2 text-lg font-black text-white">
            <StatusDot :tone="presentation.server.tone" />
            {{ presentation.server.label }}
          </dd>
        </div>
        <div class="border-b border-white/10 p-5 lg:border-r lg:border-b-0">
          <dt class="text-xs font-bold uppercase tracking-wider text-slate-400">Bot Discord</dt>
          <dd class="mt-3 flex items-center gap-2 text-lg font-black text-white">
            <StatusDot :tone="presentation.discord.tone" />
            {{ presentation.discord.label }}
          </dd>
        </div>
        <div class="border-b border-white/10 p-5 sm:border-r sm:border-b-0">
          <dt class="text-xs font-bold uppercase tracking-wider text-slate-400">Clients connectés</dt>
          <dd class="mt-3 text-lg font-black text-white">{{ presentation.clients }}</dd>
        </div>
        <div class="p-5">
          <dt class="text-xs font-bold uppercase tracking-wider text-slate-400">Version déployée</dt>
          <dd class="mt-3 break-all text-lg font-black text-white">{{ presentation.version }}</dd>
        </div>
      </dl>

      <div class="flex flex-col gap-2 border-t border-white/10 px-5 py-4 text-xs text-slate-400 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between">
        <span>Dernière vérification : {{ checkedAtLabel }}</span>
        <a href="/health.json" class="w-fit rounded font-semibold text-sky-200 underline-offset-4 hover:underline">Voir la réponse JSON</a>
      </div>
    </section>
  </div>
</template>
