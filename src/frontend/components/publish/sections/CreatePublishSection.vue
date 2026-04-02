<!--
  Overview: Create-mode publish section for drafting and uploading a new Workshop item.
  Responsibility: Composes readiness checks, visibility selection, 
  shared draft metadata fields, and content explorer actions for the create flow.
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { ContentTreeNode, PublishChecklistItem, StagedContentFile, UploadDraftState } from '../../../types/ui'
import { formatSizeLabel } from '../../../utils/size-format'
import { useContentExplorer } from '../composables/useContentExplorer'
import { useUploadPreview } from '../composables/useUploadPreview'
import { splitCreateReadinessItems } from '../model/readiness'
import { visibilityHint, visibilityLabel, visibilityOptions } from '../model/visibility'
import PublishContentExplorerPanel from '../panels/PublishContentExplorerPanel.vue'
import PublishDraftMetadataFields from '../panels/PublishDraftMetadataFields.vue'
import PublishReadinessCard from '../panels/PublishReadinessCard.vue'
import { previewBorderClass } from '../theme/visibility-theme'

const props = defineProps<{
  publishChecklist: PublishChecklistItem[]
  draft: UploadDraftState
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
  (e: 'upload'): void
  (e: 'update-app-id', value: string): void
  (e: 'update-title', value: string): void
  (e: 'update-release-notes', value: string): void
  (e: 'change-visibility-selection', value: 0 | 1 | 2 | 3): void
}>()

function onVisibilitySelectChange(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  const parsed = Number(target?.value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3) {
    return
  }
  emit('change-visibility-selection', parsed as 0 | 1 | 2 | 3)
}

function onAppIdInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-app-id', target?.value ?? '')
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

const readinessBuckets = computed(() => splitCreateReadinessItems(props.publishChecklist))
const topReadinessItems = computed(() => readinessBuckets.value.primary)
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
            :value="draft.appId"
            inputmode="numeric"
            pattern="[0-9]*"
            class="publish-field-input mt-1"
            :class="createAppIdHasInvalidFormat ? 'border-rose-400 focus-visible:outline-rose-300' : ''"
            @input="onAppIdInput"
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

      <PublishDraftMetadataFields
        :title-value="draft.title"
        :release-notes-value="draft.releaseNotes"
        :has-content-folder="hasContentFolder"
        :preview-file-value="previewFileValue"
        :upload-preview-image-src="uploadPreviewImageSrc"
        :preview-image-load-failed="previewImageLoadFailed"
        :preview-image-is-square="previewImageIsSquare"
        @update-title="emit('update-title', $event)"
        @update-release-notes="emit('update-release-notes', $event)"
        @pick-preview-file="emit('pick-preview-file')"
        @clear-preview-file="emit('clear-preview-file')"
        @preview-load="onUploadPreviewLoad"
        @preview-error="onUploadPreviewError"
      />

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
