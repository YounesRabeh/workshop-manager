<script setup lang="ts">
import { computed } from 'vue'
import type { ContentTreeNode, PublishChecklistItem, StagedContentFile, UploadDraftState } from '../../types/ui'
import { formatSizeLabel } from '../../utils/size-format'
import PublishContentExplorerPanel from './PublishContentExplorerPanel.vue'
import PublishReadinessCard from './PublishReadinessCard.vue'
import {
  previewBorderClass,
  useContentExplorer,
  useUploadPreview,
  visibilityHint,
  visibilityLabel,
  visibilityOptions
} from './publish-section.shared'
import './publish-section.shared.css'

const props = defineProps<{
  publishChecklist: PublishChecklistItem[]
  draft: UploadDraftState
  tagInput: string
  visibilityPending: 0 | 1 | 2 | 3
  stagedContentFiles: StagedContentFile[]
  stagedContentTree: ContentTreeNode[]
  totalStagedContentSizeBytes: number
  canUpload: boolean
}>()

const emit = defineEmits<{
  (e: 'pick-workspace-root'): void
  (e: 'clear-workspace'): void
  (e: 'pick-preview-file'): void
  (e: 'clear-preview-file'): void
  (e: 'change-tag-input', value: string): void
  (e: 'add-tag'): void
  (e: 'remove-tag', tag: string): void
  (e: 'upload'): void
  (e: 'change-visibility-selection', value: 0 | 1 | 2 | 3): void
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

function onVisibilitySelectChange(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  const parsed = Number(target?.value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3) {
    return
  }
  emit('change-visibility-selection', parsed as 0 | 1 | 2 | 3)
}

const sectionTitle = 'Create Workshop Item'
const readinessTitle = 'Create Readiness'
const contentFolderValue = computed(() => props.draft.contentFolder.trim())
const hasContentFolder = computed(() => contentFolderValue.value.length > 0)
const primaryActionLabel = 'Create New Item'
const primaryActionDisabled = computed(() => !props.canUpload)
const totalContentSizeLabel = computed(() => formatSizeLabel(props.totalStagedContentSizeBytes))
const previewFileValue = computed(() => props.draft.previewFile.trim())

const createAppIdHasInvalidFormat = computed(() => {
  const value = props.draft.appId.trim()
  if (!value) {
    return false
  }
  return !/^\d+$/.test(value)
})

const createAppIdHelperText = computed(() =>
  createAppIdHasInvalidFormat.value
    ? 'App ID must contain digits only.'
    : 'This must contain digits only. You can find the App ID on SteamDB.'
)

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

const readinessBuckets = computed(() => {
  const topLabels = new Set(['App ID', 'Title', 'Content folder'])
  const top = props.publishChecklist.filter((item) => topLabels.has(item.label))
  const secondary = props.publishChecklist.filter((item) => !topLabels.has(item.label))
  return { top, secondary }
})
const topReadinessItems = computed(() => readinessBuckets.value.top)
const secondaryReadinessItems = computed(() => readinessBuckets.value.secondary)

const readinessContext = computed(() => ({
  isUpdateMode: false,
  hasContentFolder: hasContentFolder.value,
  draftTitle: props.draft.title,
  createAppIdHasInvalidFormat: createAppIdHasInvalidFormat.value
}))

function submitPrimaryAction(): void {
  emit('upload')
}
</script>

<template>
  <section class="publish-layout">
    <article class="fade-in app-panel publish-main-panel">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-slate-100">{{ sectionTitle }}</h2>
      </div>

      <PublishReadinessCard
        :title="readinessTitle"
        :top-items="topReadinessItems"
        :secondary-items="secondaryReadinessItems"
        :context="readinessContext"
      />

      <div class="mt-4 grid gap-3 md:grid-cols-2 md:items-start">
        <label class="block text-sm text-slate-300">
          App ID
          <input
            v-model="draft.appId"
            inputmode="numeric"
            pattern="[0-9]*"
            class="publish-field-input mt-1"
            :class="createAppIdHasInvalidFormat ? 'border-rose-400 focus-visible:outline-rose-300' : ''"
          />
          <p class="mt-1 text-[11px]" :class="createAppIdHasInvalidFormat ? 'text-rose-300' : 'text-slate-400'">
            {{ createAppIdHelperText }}
          </p>
        </label>

        <div>
          <label class="text-sm text-slate-300">Visibility</label>
          <div class="mt-1 rounded border bg-[#0f1f2e]" :class="previewBorderClass(visibilityPending)">
            <select
              :value="visibilityPending"
              class="w-full appearance-none rounded bg-transparent px-2 py-1 text-sm font-semibold text-slate-100 focus-visible:outline-none"
              @change="onVisibilitySelectChange"
            >
              <option v-for="option in visibilityOptions" :key="`create-visibility-${option}`" :value="option" class="bg-[#0f1f2e] text-slate-100">
                {{ visibilityLabel(option) }}
              </option>
            </select>
          </div>
          <p class="mt-1 text-[11px] text-slate-400">{{ visibilityHint(visibilityPending) }}</p>
        </div>
      </div>

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
