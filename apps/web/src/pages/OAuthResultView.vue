<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

type OAuthResult = 'success' | 'invalid' | 'expired' | 'error'

type OAuthResultPresentation = {
  title: string
  message: string
  tone: 'success' | 'warning' | 'error'
  symbol: string
}

const presentations: Record<OAuthResult, OAuthResultPresentation> = {
  success: {
    title: 'Connexion réussie',
    message: 'Ton compte Discord est maintenant lié à MemeDrop. Tu peux fermer cet onglet.',
    tone: 'success',
    symbol: '✓',
  },
  invalid: {
    title: 'Connexion invalide',
    message: 'La session Discord est invalide ou expirée. Relance la connexion depuis MemeDrop.',
    tone: 'warning',
    symbol: '!',
  },
  expired: {
    title: 'Connexion expirée',
    message: 'La session Discord a expiré. Relance la connexion depuis MemeDrop.',
    tone: 'warning',
    symbol: '!',
  },
  error: {
    title: 'Connexion impossible',
    message: 'Discord a refusé la connexion. Vérifie la configuration OAuth du serveur MemeDrop.',
    tone: 'error',
    symbol: '!',
  },
}

const route = useRoute()
const result = computed<OAuthResult>(() => {
  const queryResult = route.query.result
  return queryResult === 'success'
    || queryResult === 'invalid'
    || queryResult === 'expired'
    || queryResult === 'error'
    ? queryResult
    : 'invalid'
})
const presentation = computed(() => presentations[result.value])
</script>

<template>
  <section
    class="surface-card w-full max-w-md p-6 text-center sm:p-8"
    :role="presentation.tone === 'error' ? 'alert' : 'status'"
    aria-live="polite"
    aria-atomic="true"
  >
    <img src="/memeDrop.png" alt="MemeDrop" class="mx-auto size-12 object-contain" />
    <div
      class="mx-auto mt-5 grid size-14 place-items-center rounded-2xl text-2xl font-black text-slate-950"
      :class="{
        'bg-emerald-300': presentation.tone === 'success',
        'bg-amber-300': presentation.tone === 'warning',
        'bg-rose-300': presentation.tone === 'error',
      }"
      aria-hidden="true"
    >
      {{ presentation.symbol }}
    </div>
    <h1 class="mt-5 text-2xl font-black text-white">{{ presentation.title }}</h1>
    <p class="mt-3 text-sm leading-6 text-slate-300">{{ presentation.message }}</p>
    <a
      href="/guide"
      class="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-100 transition-colors hover:bg-slate-800 motion-reduce:transition-none"
    >
      Voir le guide
    </a>
  </section>
</template>
