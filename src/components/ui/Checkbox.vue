<script setup lang="ts">
const modelValue = defineModel<boolean>({ required: true })
</script>

<template>
  <input
    v-model="modelValue"
    type="checkbox"
    class="mt-1 h-4 w-4 accent-sky-400"
  />
</template>
