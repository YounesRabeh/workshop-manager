<!--
  Overview: Reusable readiness checklist card for create/update publish forms.
  Responsibility: Renders prioritized readiness items with contextual status styling and supports collapsible details.
-->
<script setup lang="ts">
import { ref } from 'vue'
import type { PublishChecklistItem } from '../../../types/ui'
import {
  readinessItemClass as resolveReadinessItemClass,
  readinessStatusClass as resolveReadinessStatusClass,
  readinessStatusLabel as resolveReadinessStatusLabel,
  type ReadinessStyleContext
} from '../theme/readiness-theme'

const props = defineProps<{
  title: string
  topItems: PublishChecklistItem[]
  secondaryItems: PublishChecklistItem[]
  context: ReadinessStyleContext
}>()

const isCollapsed = ref(false)

function toggleCollapsed(): void {
  isCollapsed.value = !isCollapsed.value
}

function readinessItemClass(item: PublishChecklistItem): string {
  return resolveReadinessItemClass(item, props.context)
}

function readinessStatusClass(item: PublishChecklistItem): string {
  return resolveReadinessStatusClass(item, props.context)
}

function readinessStatusLabel(item: PublishChecklistItem): string {
  return resolveReadinessStatusLabel(item, props.context)
}
</script>

<template>
  <div class="publish-readiness-card rounded-xl">
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-semibold text-slate-100">{{ title }}</p>
      <button
        type="button"
        class="inline-flex h-6 w-6 items-center justify-center text-slate-100/85 transition-colors hover:text-slate-100"
        :aria-label="isCollapsed ? `Expand ${title}` : `Collapse ${title}`"
        @click="toggleCollapsed"
      >
        <svg
          class="h-3.5 w-3.5 transition-transform duration-150"
          :class="isCollapsed ? 'rotate-0' : 'rotate-180'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
    <ul v-show="!isCollapsed" class="mt-3 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
      <li
        v-for="item in topItems"
        :key="item.label"
        class="flex items-center justify-between rounded-lg border px-3 py-2"
        :class="readinessItemClass(item)"
      >
        <span>{{ item.label }}</span>
        <span class="text-xs font-semibold" :class="readinessStatusClass(item)">{{ readinessStatusLabel(item) }}</span>
      </li>
    </ul>
    <div v-show="!isCollapsed && secondaryItems.length > 0" class="mt-3 pb-2">
      <div class="border-t border-[#365572]/70"></div>
    </div>
    <ul v-show="!isCollapsed && secondaryItems.length > 0" class="grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
      <li
        v-for="item in secondaryItems"
        :key="item.label"
        class="flex items-center justify-between rounded-lg border px-3 py-2"
        :class="readinessItemClass(item)"
      >
        <span>{{ item.label }}</span>
        <span class="text-xs font-semibold" :class="readinessStatusClass(item)">{{ readinessStatusLabel(item) }}</span>
      </li>
    </ul>
  </div>
</template>
