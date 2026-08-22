<template>
  <footer class="relative z-10 border-t border-white/10">
    <div class="page-container flex flex-col gap-3 py-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
      <p>Des memes Discord, directement sur ton écran.</p>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href="https://github.com/Maubry94/MemeDrop"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded text-slate-300 underline-offset-4 hover:text-sky-200 hover:underline"
        >
          GitHub<span class="sr-only"> (nouvel onglet)</span>
        </a>
        <a
          href="/health.json"
          class="rounded text-slate-300 underline-offset-4 hover:text-sky-200 hover:underline"
        >
          État JSON
        </a>
      </div>
    </div>
  </footer>
</template>
