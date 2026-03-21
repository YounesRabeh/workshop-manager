<!--
  Overview: LogsSection.vue file in frontend/components.
  Responsibility: Defines the main structure/content for this part of the app.
-->
<script setup lang="ts">
import type { PersistedRunLog } from '../types/ui'

const props = defineProps<{
  recentRuns: PersistedRunLog[]
  selectedRunId: string
  selectedRun: PersistedRunLog | null
  formatRunTimestamp: (runId: string) => string
  statusBadgeClass: (status: PersistedRunLog['status']) => string
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'select-run', runId: string): void
}>()
</script>

<template>
  <section class="mt-5">
    <article class="fade-in app-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-md">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-lg font-semibold text-slate-800">Dedicated Logs</h2>
        <button class="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white" @click="emit('refresh')">Refresh</button>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-[280px,1fr]">
        <aside class="space-y-2">
          <button v-for="run in recentRuns" :key="run.runId" class="w-full rounded-lg border px-3 py-2 text-left text-sm transition" :class="selectedRunId === run.runId ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'" @click="emit('select-run', run.runId)">
            <p class="font-semibold text-slate-800">{{ formatRunTimestamp(run.runId) }}</p>
            <p class="mt-1 text-xs text-slate-500">{{ run.publishedFileId || 'n/a' }}</p>
            <span class="mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold" :class="statusBadgeClass(run.status)">{{ run.status }}</span>
          </button>
          <div v-if="recentRuns.length === 0" class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No runs yet.</div>
        </aside>

        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <template v-if="selectedRun">
            <div class="flex items-center justify-between gap-2">
              <p class="font-semibold text-slate-800">Run Detail</p>
              <span class="rounded-full border px-2 py-0.5 text-xs font-semibold" :class="statusBadgeClass(selectedRun.status)">{{ selectedRun.status }}</span>
            </div>
            <p class="mt-2 text-xs text-slate-500">Run ID: {{ selectedRun.runId }}</p>
            <p class="text-xs text-slate-500">PublishedFileId: {{ selectedRun.publishedFileId || 'n/a' }}</p>
            <p class="text-xs text-slate-500">Log Path: {{ selectedRun.logPath }}</p>

            <div class="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">{{ selectedRun.steamOutputSummary || 'No summary output.' }}</div>

            <div class="mt-3">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Log Lines</p>
              <div class="mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
                <p v-for="(line, idx) in selectedRun.lines.slice(-120)" :key="`${selectedRun.runId}-${idx}`">{{ line }}</p>
              </div>
            </div>
          </template>
          <p v-else class="text-sm text-slate-500">Select a run from the left to view details.</p>
        </div>
      </div>
    </article>
  </section>
</template>
