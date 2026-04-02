<!--
  Overview: Update-mode overview card for the selected Workshop item and visibility controls.
  Responsibility: Displays the current item summary and isolates visibility selection/publishing actions from section flow wiring.
-->
<script setup lang="ts">
import VisibilityIcon from '../../VisibilityIcon.vue'
import {
  type PublishVisibility,
  visibilityHint,
  visibilityLabel,
  visibilityOptions,
  visibilityTooltip
} from '../model/visibility'
import {
  previewBorderClass,
  visibilityActionClass,
  visibilityCardClass,
  visibilityOptionClass
} from '../theme/visibility-theme'

defineProps<{
  selectedItemDisplay: string
  selectedItemPreviewUrl: string
  publishedFileIdValue: string
  appIdValue: string
  visibilityCommitted: PublishVisibility
  visibilityPending: PublishVisibility
  canChangeVisibility: boolean
}>()

const emit = defineEmits<{
  (e: 'go-to-mods'): void
  (e: 'open-workshop-item'): void
  (e: 'refresh-workshop-item'): void
  (e: 'change-visibility-selection', value: PublishVisibility): void
  (e: 'update-visibility-only'): void
}>()
</script>

<template>
  <div
    class="mt-4 rounded-xl border p-4 transition-[background,border-color,box-shadow] duration-500 ease-out"
    :class="visibilityCardClass(visibilityPending)"
  >
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <button
            type="button"
            title="Back to mod list"
            aria-label="Back to mod list"
            class="inline-flex h-8 items-center justify-center gap-1 rounded border border-[#4d7ca0] bg-transparent px-2.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-[#22374b]"
            @click="emit('go-to-mods')"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Mod List</span>
          </button>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex h-8 items-center justify-center gap-1 rounded border border-[#4d7ca0] bg-[#2c4d67] px-3 text-xs font-semibold text-slate-100 transition-colors hover:bg-[#365d7b]"
            @click="emit('open-workshop-item')"
          >
            <span>View Workshop Page</span>
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 5h5v5" />
              <path d="M10 14 19 5" />
              <path d="M19 14v5h-5" />
              <path d="M5 10V5h5" />
            </svg>
          </button>
          <button
            type="button"
            class="inline-flex h-8 items-center justify-center gap-1 rounded border border-[#4d7ca0] bg-[#2c4d67] px-2.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-[#365d7b]"
            @click="emit('refresh-workshop-item')"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div class="flex min-w-0 flex-1 items-center gap-4">
        <div
          class="h-32 w-32 shrink-0 overflow-hidden rounded-lg border-2 bg-[#0f2130] transition-colors duration-300"
          :class="previewBorderClass(visibilityPending)"
        >
          <img
            v-if="selectedItemPreviewUrl"
            :src="selectedItemPreviewUrl"
            :alt="selectedItemDisplay"
            class="h-full w-full object-cover"
          />
          <div v-else class="flex h-full w-full items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            No preview
          </div>
        </div>
        <div class="min-w-0">
          <p class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
            </svg>
            Currently editing
          </p>
          <p class="text-2xl font-bold leading-tight text-slate-100">{{ selectedItemDisplay }}</p>
          <p class="mt-0.5 text-xs text-slate-300">Item ID: {{ publishedFileIdValue }}</p>
          <p class="text-xs text-slate-300">App ID: {{ appIdValue }}</p>
        </div>
      </div>

      <div class="w-full">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in visibilityOptions"
            :key="option"
            type="button"
            :title="visibilityTooltip(option)"
            :aria-label="visibilityTooltip(option)"
            :class="visibilityOptionClass(option, option === visibilityPending)"
            @click="emit('change-visibility-selection', option)"
          >
            <VisibilityIcon :visibility="option" class="h-4 w-4" />
            <span>{{ visibilityLabel(option) }}</span>
            <span
              class="pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 rounded border border-[#40627c] bg-[#0f1b28] px-2 py-1 text-[11px] font-medium leading-snug text-slate-200 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              {{ visibilityHint(option) }}
            </span>
          </button>
        </div>

        <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-slate-300">
            <span class="font-semibold text-slate-100">Current:</span> {{ visibilityLabel(visibilityCommitted) }}
            <span class="mx-2 text-slate-400">|</span>
            <span class="font-semibold text-slate-100">Pending:</span> {{ visibilityLabel(visibilityPending) }}
          </p>
          <button
            class="min-w-[190px] rounded border px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            :class="visibilityActionClass(visibilityPending)"
            :disabled="!canChangeVisibility"
            @click="emit('update-visibility-only')"
          >
            Change to {{ visibilityLabel(visibilityPending) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
