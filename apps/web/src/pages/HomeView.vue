<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppLink from '../components/AppLink.vue'

const releaseUrl = 'https://github.com/Maubry94/MemeDrop/releases/latest'

const steps = [
  {
    title: "Installe l'application",
    description: 'Télécharge MemeDrop pour Windows, installe-le puis lance l’application.',
  },
  {
    title: 'Configure et connecte',
    description: 'Renseigne les informations du serveur, qui seront conservées, puis associe ton compte Discord.',
  },
  {
    title: 'Envoie un drop',
    description: 'Utilise une commande Discord : le meme apparaît chez les destinataires connectés.',
  },
]

const features = [
  {
    title: 'Tous tes formats',
    description: 'Images, vidéos, sons, liens YouTube et TikTok passent par le même overlay.',
    symbol: '◫',
  },
  {
    title: 'Pour tous ou pour une personne',
    description: 'Diffuse à tout le monde, cible un ami ou teste discrètement avec /dropme.',
    symbol: '◎',
  },
  {
    title: 'Tu gardes le contrôle',
    description: 'Active, masque, passe ou arrête les drops depuis une interface desktop simple.',
    symbol: '◇',
  },
]
</script>

<template>
  <div>
    <section class="page-container grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-[1.2fr_0.8fr] lg:py-28">
      <div class="max-w-3xl">
        <p class="eyebrow">L’overlay Discord pour tes memes</p>
        <h1 class="mt-4 text-4xl font-black leading-[0.98] tracking-tight text-white sm:text-6xl lg:text-7xl">
          De Discord à ton écran,
          <span class="gradient-text">sans casser le rythme.</span>
        </h1>
        <p class="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
          MemeDrop affiche instantanément images, vidéos et sons envoyés depuis Discord sur l’overlay
          des personnes connectées.
        </p>
        <div class="mt-8 flex flex-col gap-3 min-[380px]:flex-row min-[380px]:flex-wrap">
          <AppLink :href="releaseUrl" external>
            Télécharger pour Windows
            <svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
              <path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 15.5h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </AppLink>
          <RouterLink
            to="/guide"
            class="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 bg-slate-900/70 px-4 py-2.5 text-sm font-bold text-slate-100 transition-colors hover:bg-slate-800 motion-reduce:transition-none"
          >
            Consulter le guide
          </RouterLink>
        </div>
        <p class="mt-3 text-xs leading-5 text-slate-400">Dernière version publiée sur GitHub · Windows 10 et 11</p>
      </div>

      <div class="relative mx-auto w-full max-w-md" aria-hidden="true">
        <div class="absolute -inset-6 -z-10 rounded-full bg-indigo-500/15 blur-3xl" />
        <div class="surface-card rotate-1 p-4 sm:p-6">
          <div class="flex items-center gap-2 border-b border-white/10 pb-4">
            <img src="/memeDrop.png" alt="" class="size-7 object-contain" />
            <span class="text-sm font-semibold">MemeDrop</span>
            <span class="ml-auto rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-200">
              En ligne
            </span>
          </div>
          <div class="mt-5 rounded-xl border border-white/10 bg-slate-950/75 p-4 shadow-2xl">
            <div class="flex items-center gap-3">
              <div class="grid size-10 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-400 font-black text-slate-950">M</div>
              <div>
                <p class="text-sm font-bold text-white">Un drop arrive !</p>
                <p class="text-xs text-slate-400">envoyé depuis Discord</p>
              </div>
            </div>
            <div class="mt-4 grid aspect-video place-items-center rounded-lg bg-gradient-to-br from-sky-400/20 via-indigo-400/10 to-slate-950">
              <img src="/memeDrop.png" alt="" class="size-24 object-contain drop-shadow-2xl" />
            </div>
            <p class="mt-3 text-center text-xs font-medium text-slate-300">« Le timing parfait. »</p>
          </div>
        </div>
      </div>
    </section>

    <section class="border-y border-white/10 bg-slate-900/30 py-14 sm:py-20" aria-labelledby="steps-title">
      <div class="page-container">
        <p class="eyebrow">Comment ça marche</p>
        <h2 id="steps-title" class="mt-3 text-2xl font-black text-white sm:text-3xl">Prêt en trois étapes</h2>
        <ol class="mt-8 grid gap-4 md:grid-cols-3">
          <li v-for="(step, index) in steps" :key="step.title" class="surface-card p-5 sm:p-6">
            <span class="grid size-8 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-400 text-sm font-black text-slate-950">
              {{ index + 1 }}
            </span>
            <h3 class="mt-5 text-base font-bold text-white">{{ step.title }}</h3>
            <p class="mt-2 text-sm leading-6 text-slate-300">{{ step.description }}</p>
          </li>
        </ol>
      </div>
    </section>

    <section class="page-container py-14 sm:py-20" aria-labelledby="features-title">
      <div class="max-w-2xl">
        <p class="eyebrow">Pensé pour rester simple</p>
        <h2 id="features-title" class="mt-3 text-2xl font-black text-white sm:text-3xl">Plus de réactions, moins de réglages</h2>
      </div>
      <div class="mt-8 grid gap-4 md:grid-cols-3">
        <article v-for="feature in features" :key="feature.title" class="rounded-2xl border border-white/10 bg-slate-900/45 p-5">
          <span class="grid size-10 place-items-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-xl text-sky-200" aria-hidden="true">
            {{ feature.symbol }}
          </span>
          <h3 class="mt-4 text-base font-bold text-white">{{ feature.title }}</h3>
          <p class="mt-2 text-sm leading-6 text-slate-300">{{ feature.description }}</p>
        </article>
      </div>

      <div class="mt-10 flex flex-col items-start justify-between gap-5 rounded-2xl border border-indigo-300/20 bg-gradient-to-r from-sky-400/10 to-indigo-400/10 p-6 sm:flex-row sm:items-center">
        <div>
          <h2 class="text-xl font-black text-white">Envie de lancer le premier drop ?</h2>
          <p class="mt-1 text-sm leading-6 text-slate-300">Le guide te mène de l’installation à ta première commande Discord.</p>
        </div>
        <RouterLink
          to="/guide"
          class="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-white motion-reduce:transition-none"
        >
          Suivre le guide
        </RouterLink>
      </div>
    </section>
  </div>
</template>
