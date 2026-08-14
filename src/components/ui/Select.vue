<script setup lang="ts">
defineOptions({ inheritAttrs: false })

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

defineProps<{
  id?: string
  options?: SelectOption[]
}>()

const modelValue = defineModel<string>({ required: true })
</script>

<template>
  <span class="relative block w-full">
    <select
      v-bind="$attrs"
      :id="id"
      v-model="modelValue"
      class="peer w-full cursor-pointer appearance-none rounded-lg border border-white/10 bg-slate-900/70 py-2 pr-8 pl-2 text-sm text-slate-100 outline-none transition-colors scheme-dark motion-reduce:transition-none focus-visible:border-sky-300/70 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <template v-if="options">
        <option
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </option>
      </template>
      <slot v-else />
    </select>

    <svg
      aria-hidden="true"
      class="pointer-events-none absolute top-1/2 right-2 h-2 w-3 -translate-y-1/2 text-slate-400 peer-disabled:opacity-60"
      fill="none"
      viewBox="0 0 12 8"
    >
      <path d="M1 1.25 6 6.75 11 1.25" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" />
    </svg>
  </span>
</template>
