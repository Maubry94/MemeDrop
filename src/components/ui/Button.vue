<script setup lang="ts">
import { computed } from 'vue'

type ButtonVariant =
  | 'neutral'
  | 'subtle'
  | 'primary'
  | 'discord'
  | 'danger'
  | 'warning'
  | 'tab'
  | 'tabActive'
  | 'icon'

type ButtonSize = 'xs' | 'sm' | 'md' | 'icon'

const props = withDefaults(
  defineProps<{
    type?: 'button' | 'submit' | 'reset'
    variant?: ButtonVariant
    size?: ButtonSize
    fullWidth?: boolean
  }>(),
  {
    type: 'button',
    variant: 'neutral',
    size: 'sm',
    fullWidth: false,
  },
)

const baseClasses =
  'cursor-pointer border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'

const variantClasses: Record<ButtonVariant, string> = {
  neutral: 'border-white/10 bg-slate-900/70 text-slate-200 hover:bg-slate-900/90',
  subtle: 'border-white/10 bg-slate-950/70 text-slate-200 hover:bg-slate-950',
  primary: 'border-white/10 bg-sky-400 text-slate-950 hover:bg-sky-300',
  discord: 'border-white/10 bg-indigo-400 text-slate-950 hover:bg-indigo-300',
  danger: 'border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
  warning: 'border-amber-200/30 bg-amber-300/15 text-amber-50 hover:bg-amber-300/25',
  tab: 'border-transparent bg-transparent text-slate-400 hover:bg-slate-800/80 hover:text-slate-200',
  tabActive: 'border-transparent bg-slate-700 text-slate-100 shadow-sm',
  icon: 'border-white/10 bg-slate-900/70 text-slate-300 hover:bg-slate-900',
}

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'rounded-md px-2 py-1 text-[11px]',
  sm: 'rounded-lg px-3 py-2 text-xs',
  md: 'rounded-lg px-3 py-3 text-sm',
  icon: 'flex size-8 items-center justify-center rounded-md',
}

const buttonClasses = computed(() => [
  baseClasses,
  variantClasses[props.variant],
  sizeClasses[props.size],
  props.fullWidth ? 'w-full' : '',
])
</script>

<template>
  <button :type="type" :class="buttonClasses">
    <slot />
  </button>
</template>
