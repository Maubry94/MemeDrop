<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import SiteFooter from './components/SiteFooter.vue'
import SiteHeader from './components/SiteHeader.vue'

const route = useRoute()
const isStandalone = computed(() => route.meta.standalone === true)
</script>

<template>
  <div class="relative isolate flex min-h-dvh flex-col overflow-x-clip bg-slate-950 text-slate-100">
    <div class="site-glow site-glow-top" aria-hidden="true" />
    <div class="site-glow site-glow-bottom" aria-hidden="true" />

    <template v-if="!isStandalone">
      <a class="skip-link" href="#main-content">Aller au contenu principal</a>
      <SiteHeader />
    </template>

    <main
      id="main-content"
      class="relative z-10 flex-1"
      :class="isStandalone ? 'grid place-items-center px-4 py-10' : ''"
      tabindex="-1"
    >
      <RouterView />
    </main>

    <SiteFooter v-if="!isStandalone" />
  </div>
</template>
