<script setup lang="ts">
import type { WorkshopItemSummary } from '@shared/contracts'
import VisibilityIcon from './VisibilityIcon.vue'
import type { WorkshopVisibilityFilter } from '../types/ui'

const props = defineProps<{
  appId: string
  workshopItems: WorkshopItemSummary[]
  allItemsCount: number
  visibilityFilter: WorkshopVisibilityFilter
  selectedWorkshopItemId: string
}>()

const emit = defineEmits<{
  (e: 'change-app-id', value: string): void
  (e: 'change-visibility-filter', value: WorkshopVisibilityFilter): void
  (e: 'reset-filter'): void
  (e: 'refresh'): void
  (e: 'select-item', item: WorkshopItemSummary): void
}>()

type VisibilityBadge = {
  label: 'Public' | 'Friends-only' | 'Hidden' | 'Unlisted' | 'Unknown'
  toneClass: string
}

function onAppIdInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('change-app-id', target?.value ?? '')
}

function onVisibilityFilterInput(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  const value = target?.value as WorkshopVisibilityFilter | undefined
  if (!value) {
    return
  }
  emit('change-visibility-filter', value)
}

function getVisibilityBadge(visibility: WorkshopItemSummary['visibility']): VisibilityBadge {
  if (visibility === 0) {
    return { label: 'Public', toneClass: 'workshop-visibility-public' }
  }
  if (visibility === 1) {
    return { label: 'Friends-only', toneClass: 'workshop-visibility-friends' }
  }
  if (visibility === 2) {
    return { label: 'Hidden', toneClass: 'workshop-visibility-hidden' }
  }
  if (visibility === 3) {
    return { label: 'Unlisted', toneClass: 'workshop-visibility-unlisted' }
  }
  return { label: 'Unknown', toneClass: 'workshop-visibility-unknown' }
}
</script>

<template>
  <section class="mt-5">
    <article class="fade-in app-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-md">
      <div class="flex flex-col gap-3">
        <div>
          <h2 class="text-lg font-semibold text-slate-800">My Workshop Items</h2>
          <p class="mt-1 text-sm text-slate-600">Click an item to auto-fill publish data.</p>
        </div>
        <div class="flex w-full flex-wrap items-center gap-2">
          <select
            :value="visibilityFilter"
            class="workshop-visibility-filter-select rounded border border-slate-300 px-2 py-2 text-xs min-[720px]:w-[170px]"
            @change="onVisibilityFilterInput"
          >
            <option value="all">Visibility: All</option>
            <option value="public">Visibility: Public</option>
            <option value="friends">Visibility: Friends-only</option>
            <option value="hidden">Visibility: Hidden</option>
            <option value="unlisted">Visibility: Unlisted</option>
            <option value="unknown">Visibility: Unknown</option>
          </select>
          <input
            :value="appId"
            placeholder="Filter by App ID (optional)"
            class="w-full min-w-[240px] flex-1 rounded border border-slate-300 px-2 py-2 text-xs"
            @input="onAppIdInput"
          />
          <button
            class="steam-btn-muted rounded px-3 py-2 text-xs font-semibold disabled:opacity-40"
            :disabled="appId.trim().length === 0"
            @click="emit('reset-filter')"
          >
            Reset
          </button>
          <button class="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white" @click="emit('refresh')">Refresh</button>
        </div>
      </div>

      <p v-if="allItemsCount > 0" class="mt-2 text-xs text-slate-500">
        Showing {{ workshopItems.length }} of {{ allItemsCount }} item(s).
      </p>

      <div v-if="workshopItems.length === 0" class="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
        No workshop items found for the current filters.
      </div>

      <div v-else class="mt-4 flex flex-wrap gap-4">
        <button
          v-for="item in workshopItems"
          :key="item.publishedFileId"
          class="workshop-card w-full min-[700px]:w-[320px] overflow-hidden rounded-xl border text-left transition"
          :class="selectedWorkshopItemId === item.publishedFileId ? 'workshop-card-selected' : 'border-slate-200 bg-white hover:bg-slate-50'"
          @click="emit('select-item', item)"
        >
          <div class="workshop-preview aspect-square w-full bg-slate-100">
            <img v-if="item.previewUrl" :src="item.previewUrl" :alt="item.title" class="h-full w-full object-cover" />
            <div v-else class="flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-wide text-slate-500">No preview</div>
          </div>
          <div class="workshop-card-details p-3">
            <p class="line-clamp-2 font-semibold text-slate-800">{{ item.title }}</p>
            <div class="mt-2">
              <span
                class="workshop-visibility-badge inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                :class="getVisibilityBadge(item.visibility).toneClass"
              >
                <VisibilityIcon :visibility="item.visibility" class="h-3.5 w-3.5" />
                <span>{{ getVisibilityBadge(item.visibility).label }}</span>
              </span>
            </div>
            <p class="mt-1 text-xs text-slate-600">ID: {{ item.publishedFileId }}</p>
            <p class="text-xs text-slate-600">App ID: {{ item.appId || 'n/a' }}</p>
          </div>
        </button>
      </div>
    </article>
  </section>
</template>
