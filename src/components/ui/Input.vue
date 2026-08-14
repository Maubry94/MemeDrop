<script setup lang="ts">
type InputType = 'email' | 'number' | 'password' | 'text' | 'url'

withDefaults(
  defineProps<{
    type?: InputType
  }>(),
  {
    type: 'text',
  },
)

const modelValue = defineModel<string | number>({ required: true })
</script>

<template>
  <input
    v-model="modelValue"
    :type="type"
    class="w-full rounded-lg border border-white/10 bg-slate-950/70 px-2 py-2 text-sm text-slate-100 outline-none transition-colors motion-reduce:transition-none focus-visible:border-sky-300/70 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
  />
</template>
