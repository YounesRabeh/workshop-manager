<!--
  Overview: Reusable confirmation dialog for create and update publish actions.
  Responsibility: Presents a modal confirmation surface with shared layout and emits confirm/cancel events.
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  kicker: string
  title: string
  subject: string
  description: string
  confirmLabel: string
  cancelLabel?: string
}>(), {
  cancelLabel: 'Cancel'
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()
</script>

<template>
  <div
    v-if="props.open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
    @click.self="emit('close')"
  >
    <article class="w-full max-w-md rounded-xl border border-[#2a475e] bg-[#162534] p-5 shadow-2xl">
      <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{{ props.kicker }}</p>
      <h2 class="mt-1 text-xl font-bold text-slate-100">{{ props.title }}</h2>
      <p class="mt-2 text-sm text-slate-300">
        <span class="font-semibold text-slate-100">{{ props.subject }}</span>
      </p>
      <p class="mt-2 text-xs text-slate-400">{{ props.description }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button class="steam-btn-muted rounded px-3 py-1.5 text-xs font-semibold" @click="emit('close')">
          {{ props.cancelLabel }}
        </button>
        <button
          class="rounded border border-[#78c2f7] bg-[#2c7fb2] px-3 py-1.5 text-xs font-semibold text-slate-100"
          @click="emit('confirm')"
        >
          {{ props.confirmLabel }}
        </button>
      </div>
    </article>
  </div>
</template>
