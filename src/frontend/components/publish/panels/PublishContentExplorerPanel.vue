<!--
  Overview: Side-panel content explorer for staged workshop files.
  Responsibility: Displays selected content-folder summary and interactive file tree controls 
  (collapse/expand/reset/select-folder) for publish flows.
-->
<script setup lang="ts">
import type { FlattenedContentNode } from '../composables/useContentExplorer'
import type { StagedContentFile } from '../../../types/ui'
import { formatSizeLabel } from '../../../utils/size-format'

defineProps<{
  stagedContentFiles: StagedContentFile[]
  flattenedContentNodes: FlattenedContentNode[]
  hasContentFolder: boolean
  contentFolderValue: string
  totalContentSizeLabel: string
  isContentExplorerCollapsed: boolean
  isTreeToggleCollapsed: boolean
  isFolderCollapsed: (folderId: string) => boolean
}>()

const emit = defineEmits<{
  (e: 'pick-workspace-root'): void
  (e: 'clear-workspace'): void
  (e: 'toggle-all-folders'): void
  (e: 'toggle-content-explorer'): void
  (e: 'toggle-folder', folderId: string): void
}>()
</script>

<template>
  <article class="publish-side-panel fade-in app-panel h-fit rounded-2xl border p-5 shadow-md xl:p-6 2xl:sticky 2xl:top-4">
    <h2 class="text-xl font-semibold text-orange-200">Content Explorer</h2>
    <div class="mt-3 grid grid-cols-2 gap-2">
      <button
        class="flex min-h-[3.25rem] items-center justify-center rounded border border-[#6ecbff] bg-[#59b9f8] px-3 text-center text-sm font-semibold leading-tight text-[#05253a]"
        @click="emit('pick-workspace-root')"
      >
        Choose Content Folder
      </button>
      <button
        class="flex min-h-[3.25rem] items-center justify-center rounded border border-[#4d7ca0] bg-[#2c4d67] px-3 text-center text-sm font-semibold leading-tight text-slate-100 disabled:opacity-40"
        :disabled="!hasContentFolder && stagedContentFiles.length === 0"
        @click="emit('clear-workspace')"
      >
        Reset Folder
      </button>
    </div>

    <div class="mt-4 rounded-lg border border-[#ad6f2f] bg-[#1f3248] px-3 py-3">
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm text-orange-100/85">Selected Content Folder</p>
      </div>
      <p
        class="mt-1 truncate text-lg font-semibold text-orange-100"
        :title="hasContentFolder ? contentFolderValue : 'Not selected'"
      >
        {{ hasContentFolder ? contentFolderValue : 'Not selected' }}
      </p>
    </div>

    <div class="mt-4 rounded-lg border border-[#ad6f2f] bg-[#1f3248]">
      <div
        class="flex w-full items-center justify-between px-3 py-2 text-left"
        :class="isContentExplorerCollapsed ? '' : 'border-b border-[#ad6f2f]'"
      >
        <span class="text-base font-semibold text-slate-100">Content Explorer</span>
        <div class="flex items-center gap-2">
          <span class="text-sm text-slate-300">{{ stagedContentFiles.length }} item(s) • {{ totalContentSizeLabel }}</span>
          <button
            type="button"
            class="inline-flex w-[92px] items-center justify-center gap-1 rounded border border-[#4d7ca0] bg-[#2c4d67] px-2 py-0.5 text-xs font-semibold text-slate-100"
            :aria-label="isTreeToggleCollapsed ? 'Expand all folders' : 'Collapse all folders'"
            @click="emit('toggle-all-folders')"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l1.8 2H19.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z" />
              <path d="M8 12h8" />
              <path v-if="isTreeToggleCollapsed" d="M12 8v8" />
            </svg>
            {{ isTreeToggleCollapsed ? 'Expand' : 'Collapse' }}
          </button>
          <button
            type="button"
            class="inline-flex h-6 w-7 items-center justify-center rounded border border-[#4d7ca0] bg-[#2c4d67] text-slate-100"
            :aria-label="isContentExplorerCollapsed ? 'Expand content explorer' : 'Collapse content explorer'"
            @click="emit('toggle-content-explorer')"
          >
            <svg
              class="h-3.5 w-3.5 transition-transform duration-150"
              :class="isContentExplorerCollapsed ? 'rotate-0' : 'rotate-180'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>
      <div v-show="!isContentExplorerCollapsed" class="max-h-72 overflow-auto px-3 py-2 xl:max-h-[24rem]">
        <p v-if="stagedContentFiles.length === 0" class="text-sm text-slate-300">No files found in selected content folder.</p>
        <ul v-else class="space-y-2 text-sm text-slate-200">
          <li
            v-for="{ node, depth } in flattenedContentNodes"
            :key="node.id"
            class="group min-w-0 flex items-center justify-between gap-3 rounded-lg border border-[#355874] bg-[linear-gradient(120deg,#122638,#152d41)] px-3 py-2 transition-colors hover:border-[#5d88ab] hover:bg-[linear-gradient(120deg,#16314a,#1a3850)]"
            :style="{ paddingLeft: `${0.75 + depth * 0.85}rem` }"
          >
            <button
              v-if="node.type === 'folder'"
              type="button"
              class="min-w-0 flex flex-1 items-center gap-2 text-left"
              @click.stop="emit('toggle-folder', node.id)"
            >
              <svg
                class="h-4 w-4 shrink-0 text-slate-300 transition-transform duration-150"
                :class="isFolderCollapsed(node.id) ? '-rotate-90' : 'rotate-0'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
              <svg class="h-4 w-4 shrink-0 text-sky-300/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l1.8 2H19.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z" />
              </svg>
              <div class="min-w-0 flex-1 overflow-hidden">
                <p class="truncate text-[14px] font-semibold text-slate-100" :title="node.name">{{ node.name }}</p>
                <p class="mt-0.5 truncate text-[11px] text-slate-400">{{ node.fileCount }} file(s) • {{ formatSizeLabel(node.sizeBytes) }}</p>
              </div>
            </button>
            <div v-else class="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
              <span class="w-4 shrink-0" aria-hidden="true" />
              <svg class="h-4 w-4 shrink-0 text-cyan-200/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M8 3h6l5 5v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
                <path d="M14 3v6h6" />
              </svg>
              <p class="min-w-0 truncate text-[14px] font-semibold text-slate-100" :title="node.name">{{ node.name }}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="shrink-0 rounded-md border border-[#466887] bg-[#102335] px-2.5 py-0.5 text-xs font-medium text-slate-100">
                {{ formatSizeLabel(node.sizeBytes) }}
              </span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </article>
</template>
