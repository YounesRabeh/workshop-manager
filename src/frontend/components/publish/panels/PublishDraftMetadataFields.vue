<!--
  Overview: Reusable publish form block for draft metadata and media fields.
  Responsibility: Renders shared title/release-notes/thumbnail inputs and emits normalized UI events for create/update flows.
-->
<script setup lang="ts">
import type { UploadDraftState } from '../../../types/ui'

const props = defineProps<{
  draft: UploadDraftState
  hasContentFolder: boolean
  previewFileValue: string
  uploadPreviewImageSrc: string
  previewImageLoadFailed: boolean
  previewImageIsSquare: boolean | null
}>()

const emit = defineEmits<{
  (e: 'pick-preview-file'): void
  (e: 'clear-preview-file'): void
  (e: 'preview-load', event: Event): void
  (e: 'preview-error'): void
}>()

function onPreviewLoad(event: Event): void {
  emit('preview-load', event)
}
</script>

<template>
  <label class="mt-3 block text-sm text-slate-300">Title</label>
  <input v-model="props.draft.title" class="publish-field-input mt-1" />

  <label class="mt-3 block text-sm text-slate-300">Release Notes (optional)</label>
  <textarea
    v-model="props.draft.releaseNotes"
    rows="2"
    :disabled="!props.hasContentFolder"
    :placeholder="!props.hasContentFolder ? 'Select a content folder to enable release notes.' : ''"
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
            v-if="props.uploadPreviewImageSrc && !props.previewImageLoadFailed"
            :src="props.uploadPreviewImageSrc"
            alt="Workshop preview thumbnail"
            class="h-full w-full object-cover"
            @load="onPreviewLoad"
            @error="emit('preview-error')"
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
          {{ props.previewFileValue || 'No preview file selected' }}
        </p>
        <button
          v-if="props.previewFileValue"
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
        v-if="props.previewFileValue && props.previewImageIsSquare === false && !props.previewImageLoadFailed"
        class="mt-1 text-[11px] text-amber-300"
      >
        Warning: preview image is not square (1:1). Steam thumbnails look best when square.
      </p>
    </div>

  </div>
</template>
