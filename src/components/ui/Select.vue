<script setup lang="ts">
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
  <select
    :id="id"
    v-model="modelValue"
    class="w-full rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-sm text-slate-100"
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
</template>
