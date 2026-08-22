<script setup lang="ts">
import { RouterLink } from 'vue-router'

const navigation = [
  { to: '/', label: 'Accueil' },
  { to: '/guide', label: 'Guide' },
  { to: '/health', label: 'État' },
]
</script>

<template>
  <header class="relative z-20 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
    <div class="page-container flex min-h-16 items-center justify-between gap-3 py-2">
      <RouterLink
        to="/"
        class="flex min-w-0 items-center gap-2 rounded-lg font-semibold text-slate-100"
        aria-label="MemeDrop, accueil"
      >
        <img src="/memeDrop.png" alt="" class="size-8 shrink-0 object-contain" aria-hidden="true" />
        <span class="truncate text-sm sm:text-base">MemeDrop</span>
      </RouterLink>

      <nav aria-label="Navigation principale">
        <ul class="flex items-center gap-0.5 sm:gap-1">
          <li v-for="item in navigation" :key="item.to">
            <RouterLink
              :to="item.to"
              class="block rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white motion-reduce:transition-none sm:px-3 sm:text-sm"
              active-class="bg-slate-800 text-sky-200"
              :aria-current="$route.path === item.to ? 'page' : undefined"
            >
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>
    </div>
  </header>
</template>
