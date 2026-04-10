<!--
  Overview: About modal for app identity and version details.
  Responsibility: Presents static application metadata in a dedicated dialog surface.
-->
<script setup lang="ts">
const props = defineProps<{
  open: boolean
  appVersion: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div
    v-if="props.open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
    @click.self="emit('close')"
  >
    <article class="w-full max-w-md rounded-xl border border-[#2a475e] bg-[#162534] p-5 shadow-2xl">
      <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">About</p>
      <h2 class="mt-1 text-xl font-bold text-slate-100">Workshop Manager</h2>
      <p class="mt-2 text-sm text-slate-300">
        Developer utility for Steam Workshop uploads and updates.
      </p>
      <p class="mt-2 text-xs text-slate-400">
        Version:
        <a
          href="https://github.com/YounesRabeh/workshop-manager"
          target="_blank"
          rel="noopener noreferrer"
          class="font-semibold text-slate-200 hover:text-white"
        >
          v{{ props.appVersion || 'dev' }}
        </a>
      </p>
      <p class="mt-1 text-xs text-slate-400">
        Author:
        <a
          href="https://github.com/YounesRabeh"
          target="_blank"
          rel="noopener noreferrer"
          class="font-semibold text-slate-200 hover:text-white"
        >
          Younes Rabeh
        </a>
      </p>
      <p class="mt-3 text-xs text-slate-400">* Not an official Steam product.</p>
      <div class="mt-4 flex justify-end">
        <button class="steam-btn-muted rounded px-3 py-1.5 text-xs font-semibold" @click="emit('close')">Close</button>
      </div>
    </article>
  </div>
</template>
