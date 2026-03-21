<!--
  Overview: UpdatePublishSection.vue file in frontend/components/publish.
  Responsibility: Defines the main structure/content for this part of the app.
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { WorkshopItemSummary } from '@shared/contracts'
import type { ContentTreeNode, PublishChecklistItem, StagedContentFile, UploadDraftState } from '../../types/ui'
import { formatSizeLabel } from '../../utils/size-format'
import PublishContentExplorerPanel from './PublishContentExplorerPanel.vue'
import PublishReadinessCard from './PublishReadinessCard.vue'
import VisibilityIcon from '../VisibilityIcon.vue'
import {
  previewBorderClass,
  splitReadinessItems,
  useContentExplorer,
  useUploadPreview,
  visibilityActionClass,
  visibilityCardClass,
  visibilityHint,
  visibilityLabel,
  visibilityOptionClass,
  visibilityOptions,
  visibilityTooltip
} from './publish-section.shared'
import './publish-section.shared.css'

const props = defineProps<{
  selectedWorkshopItem: WorkshopItemSummary | undefined
  publishChecklist: PublishChecklistItem[]
  draft: UploadDraftState
  tagInput: string
  visibilityCommitted: 0 | 1 | 2 | 3
  visibilityPending: 0 | 1 | 2 | 3
  canChangeVisibility: boolean
  stagedContentFiles: StagedContentFile[]
  stagedContentTree: ContentTreeNode[]
  totalStagedContentSizeBytes: number
  canUpdate: boolean
}>()

const emit = defineEmits<{
  (e: 'go-to-mods'): void
  (e: 'refresh-workshop-item'): void
  (e: 'open-workshop-item'): void
  (e: 'pick-workspace-root'): void
  (e: 'clear-workspace'): void
  (e: 'pick-preview-file'): void
  (e: 'clear-preview-file'): void
  (e: 'change-tag-input', value: string): void
  (e: 'add-tag'): void
  (e: 'remove-tag', tag: string): void
  (e: 'update-item'): void
  (e: 'change-visibility-selection', value: 0 | 1 | 2 | 3): void
  (e: 'update-visibility-only'): void
}>()

function onTagInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('change-tag-input', target?.value ?? '')
}

function onTagKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ',' && event.key !== ';') {
    return
  }
  event.preventDefault()
  emit('add-tag')
}

function onVisibilityOptionClick(value: 0 | 1 | 2 | 3): void {
  emit('change-visibility-selection', value)
}

const sectionTitle = 'Update Selected Workshop Item'
const readinessTitle = 'Update Readiness'
const selectedItemDisplay = computed(() => props.selectedWorkshopItem?.title || props.selectedWorkshopItem?.publishedFileId || 'No item selected')
const selectedItemPreviewUrl = computed(() => props.selectedWorkshopItem?.previewUrl || '')
const contentFolderValue = computed(() => props.draft.contentFolder.trim())
const hasContentFolder = computed(() => contentFolderValue.value.length > 0)
const primaryActionLabel = 'Update Item'
const primaryActionDisabled = computed(() => !props.canUpdate)
const publishedFileIdValue = computed(() => props.selectedWorkshopItem?.publishedFileId || props.draft.publishedFileId || 'Not selected')
const appIdValue = computed(() => props.selectedWorkshopItem?.appId || props.draft.appId || 'Not selected')
const totalContentSizeLabel = computed(() => formatSizeLabel(props.totalStagedContentSizeBytes))
const previewFileValue = computed(() => props.draft.previewFile.trim())

const {
  uploadPreviewImageSrc,
  previewImageLoadFailed,
  previewImageIsSquare,
  onUploadPreviewError,
  onUploadPreviewLoad
} = useUploadPreview(previewFileValue)

const {
  flattenedContentNodes,
  isContentExplorerCollapsed,
  isTreeToggleCollapsed,
  isFolderCollapsed,
  toggleFolder,
  toggleAllFolders,
  toggleContentExplorerCollapsed
} = useContentExplorer(computed(() => props.stagedContentTree))

const readinessBuckets = computed(() => splitReadinessItems(props.publishChecklist))
const topReadinessItems = computed(() => readinessBuckets.value.top)
const secondaryReadinessItems = computed(() => readinessBuckets.value.secondary)

const readinessContext = computed(() => ({
  isUpdateMode: true,
  hasContentFolder: hasContentFolder.value,
  draftTitle: props.draft.title,
  createAppIdHasInvalidFormat: false
}))

function submitPrimaryAction(): void {
  emit('update-item')
}
</script>

<template>
  <section class="publish-layout">
    <article class="fade-in app-panel publish-main-panel">
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
          <h2 class="text-lg font-semibold text-slate-100">{{ sectionTitle }}</h2>
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

      <div
        class="mt-4 rounded-xl border p-4 transition-[background,border-color,box-shadow] duration-500 ease-out"
        :class="visibilityCardClass(visibilityPending)"
      >
        <div class="flex flex-col gap-4">
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
                @click="onVisibilityOptionClick(option)"
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

      <PublishReadinessCard
        :title="readinessTitle"
        :top-items="topReadinessItems"
        :secondary-items="secondaryReadinessItems"
        :context="readinessContext"
      />

      <label class="mt-3 block text-sm text-slate-300">Title</label>
      <input v-model="draft.title" class="publish-field-input mt-1" />

      <label class="mt-3 block text-sm text-slate-300">Release Notes (optional)</label>
      <textarea
        v-model="draft.releaseNotes"
        rows="2"
        :disabled="!hasContentFolder"
        :placeholder="!hasContentFolder ? 'Select a content folder to enable release notes.' : ''"
        class="publish-field-textarea mt-1"
      />

      <div class="mt-3 grid gap-3 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <div class="max-w-[22rem]">
          <label class="text-sm text-slate-300">Thumbnail (optional)</label>
          <button
            type="button"
            class="publish-preview-picker mt-1"
            @click="emit('pick-preview-file')"
          >
            <div class="aspect-square w-full">
              <img
                v-if="uploadPreviewImageSrc && !previewImageLoadFailed"
                :src="uploadPreviewImageSrc"
                alt="Workshop preview thumbnail"
                class="h-full w-full object-cover"
                @load="onUploadPreviewLoad"
                @error="onUploadPreviewError"
              />
              <div v-else class="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-slate-300">
                <svg class="h-12 w-12 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
                  <circle cx="9" cy="10" r="1.5" />
                  <path d="m6.5 16 3.3-3.5 2.7 2.6 2.1-2.2 2.9 3.1" />
                </svg>
                <span>Click to choose an image</span>
              </div>
            </div>
          </button>
          <div class="mt-2 flex items-center justify-between gap-2">
            <p class="truncate text-xs text-slate-400">
              {{ previewFileValue || 'No preview file selected' }}
            </p>
            <button
              v-if="previewFileValue"
              type="button"
              title="Clear selected image"
              aria-label="Clear selected image"
              class="publish-preview-clear-button shrink-0"
              @click="emit('clear-preview-file')"
            >
              Clear
            </button>
          </div>
          <p
            v-if="previewFileValue && previewImageIsSquare === false && !previewImageLoadFailed"
            class="mt-1 text-[11px] text-amber-300"
          >
            Warning: preview image is not square (1:1). Steam thumbnails look best when square.
          </p>
        </div>

        <div>
          <label class="text-sm text-slate-300">Tags</label>
          <div class="mt-1 flex gap-2">
            <input
              :value="tagInput"
              placeholder="Add tags (Enter, comma, or semicolon)"
              class="publish-tag-input"
              @input="onTagInput"
              @keydown="onTagKeydown"
            />
            <button
              type="button"
              class="publish-tag-add-button"
              @click="emit('add-tag')"
            >
              Add
            </button>
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            <button type="button" v-for="tag in draft.tags" :key="tag" class="rounded-full border border-[#386487] bg-[#122638] px-3 py-1 text-xs font-semibold text-sky-200" @click="emit('remove-tag', tag)">
              {{ tag }} x
            </button>
          </div>
        </div>
      </div>

      <div class="mt-4">
        <button
          class="w-full publish-primary-action-button"
          :disabled="primaryActionDisabled"
          @click="submitPrimaryAction"
        >
          {{ primaryActionLabel }}
        </button>
      </div>
    </article>

    <PublishContentExplorerPanel
      :staged-content-files="stagedContentFiles"
      :flattened-content-nodes="flattenedContentNodes"
      :has-content-folder="hasContentFolder"
      :content-folder-value="contentFolderValue"
      :total-content-size-label="totalContentSizeLabel"
      :is-content-explorer-collapsed="isContentExplorerCollapsed"
      :is-tree-toggle-collapsed="isTreeToggleCollapsed"
      :is-folder-collapsed="isFolderCollapsed"
      @pick-workspace-root="emit('pick-workspace-root')"
      @clear-workspace="emit('clear-workspace')"
      @toggle-all-folders="toggleAllFolders"
      @toggle-content-explorer="toggleContentExplorerCollapsed"
      @toggle-folder="toggleFolder"
    />
  </section>
</template>
