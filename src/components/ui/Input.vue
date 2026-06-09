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
    class="w-full rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-sm text-slate-100"
  />
</template>
