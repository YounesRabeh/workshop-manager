<!--
  Overview: Update-mode publish section for editing an existing Workshop item.
  Responsibility: Coordinates visibility changes, readiness checks, shared draft metadata fields, 
  and content explorer interactions for update actions.
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { WorkshopItemSummary } from '@shared/contracts'
import type { ContentTreeNode, PublishChecklistItem, StagedContentFile, UploadDraftState } from '../../../types/ui'
import { formatSizeLabel } from '../../../utils/size-format'
import { useContentExplorer } from '../composables/useContentExplorer'
import { useUploadPreview } from '../composables/useUploadPreview'
import { splitUpdateReadinessItems } from '../model/readiness'
import PublishContentExplorerPanel from '../panels/PublishContentExplorerPanel.vue'
import PublishDraftMetadataFields from '../panels/PublishDraftMetadataFields.vue'
import PublishReadinessCard from '../panels/PublishReadinessCard.vue'
import PublishUpdateOverviewCard from '../panels/PublishUpdateOverviewCard.vue'

const props = defineProps<{
  selectedWorkshopItem: WorkshopItemSummary | undefined
  publishChecklist: PublishChecklistItem[]
  draft: UploadDraftState
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
  (e: 'update-item'): void
  (e: 'update-title', value: string): void
  (e: 'update-release-notes', value: string): void
  (e: 'change-visibility-selection', value: 0 | 1 | 2 | 3): void
  (e: 'update-visibility-only'): void
}>()

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

const readinessBuckets = computed(() => splitUpdateReadinessItems(props.publishChecklist))
const topReadinessItems = computed(() => readinessBuckets.value.primary)
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
        <h2 class="text-lg font-semibold text-slate-100">{{ sectionTitle }}</h2>
      </div>

      <PublishUpdateOverviewCard
        :selected-item-display="selectedItemDisplay"
        :selected-item-preview-url="selectedItemPreviewUrl"
        :published-file-id-value="publishedFileIdValue"
        :app-id-value="appIdValue"
        :visibility-committed="visibilityCommitted"
        :visibility-pending="visibilityPending"
        :can-change-visibility="canChangeVisibility"
        @go-to-mods="emit('go-to-mods')"
        @open-workshop-item="emit('open-workshop-item')"
        @refresh-workshop-item="emit('refresh-workshop-item')"
        @change-visibility-selection="emit('change-visibility-selection', $event)"
        @update-visibility-only="emit('update-visibility-only')"
      />

      <PublishReadinessCard
        :title="readinessTitle"
        :top-items="topReadinessItems"
        :secondary-items="secondaryReadinessItems"
        :context="readinessContext"
      />

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
