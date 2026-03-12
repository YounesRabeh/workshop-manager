<script setup lang="ts">
import { computed } from 'vue'
import type { WorkshopItemSummary } from '@shared/contracts'
import type { PublishChecklistItem, UploadDraftState } from '../types/ui'
import VisibilityIcon from './VisibilityIcon.vue'

const props = defineProps<{
  mode: 'update' | 'create'
  selectedWorkshopItem: WorkshopItemSummary | undefined
  publishChecklist: PublishChecklistItem[]
  draft: UploadDraftState
  tagInput: string
  visibilityCommitted: 0 | 1 | 2 | 3
  visibilityPending: 0 | 1 | 2 | 3
  canChangeVisibility: boolean
  uploadFiles: string[]
  isUploadDropActive: boolean
  canUpload: boolean
  canUpdate: boolean
}>()

const emit = defineEmits<{
  (e: 'go-to-mods'): void
  (e: 'pick-content-folder'): void
  (e: 'pick-preview-file'): void
  (e: 'change-tag-input', value: string): void
  (e: 'add-tag'): void
  (e: 'remove-tag', tag: string): void
  (e: 'upload'): void
  (e: 'update-item'): void
  (e: 'change-visibility-selection', value: 0 | 1 | 2 | 3): void
  (e: 'update-visibility-only'): void
  (e: 'pick-upload-files'): void
  (e: 'use-staged-folder-as-content'): void
  (e: 'clear-upload-files'): void
  (e: 'upload-drag-over', event: DragEvent): void
  (e: 'upload-drag-leave', event: DragEvent): void
  (e: 'upload-drop', event: DragEvent): void
  (e: 'remove-staged-file', path: string): void
}>()

function fileNameFromPath(path: string): string {
  const segments = path.split(/[/\\]/)
  return segments[segments.length - 1] || path
}

function onTagInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('change-tag-input', target?.value ?? '')
}

function visibilityLabel(value: 0 | 1 | 2 | 3): string {
  if (value === 0) return 'Public'
  if (value === 1) return 'Friends-only'
  if (value === 2) return 'Hidden'
  return 'Unlisted'
}

function visibilityHint(value: 0 | 1 | 2 | 3): string {
  if (value === 0) {
    return 'This item is visible to everyone and can appear in searches and on your profile.'
  }
  if (value === 1) {
    return 'This item is only visible in searches to you, your friends, and admins.'
  }
  if (value === 2) {
    return 'This item is only visible to you, admins, and anyone marked as a creator.'
  }
  return 'This item is visible to everyone, but will not show up in searches or on your profile.'
}

function visibilityTooltip(value: 0 | 1 | 2 | 3): string {
  return `${visibilityLabel(value)}: ${visibilityHint(value)}`
}

function visibilityCardClass(value: 0 | 1 | 2 | 3): string {
  if (value === 0) {
    return 'border-[#4eb787] bg-[radial-gradient(120%_160%_at_0%_0%,rgba(78,183,135,0.34)_0%,rgba(50,111,90,0.18)_28%,rgba(19,36,55,0.96)_70%),linear-gradient(135deg,rgba(24,44,64,0.96)_0%,rgba(16,31,46,0.98)_100%)] shadow-[inset_0_0_0_1px_rgba(78,183,135,0.34),0_0_22px_rgba(41,136,99,0.22)]'
  }
  if (value === 1) {
    return 'border-[#e2ab5f] bg-[radial-gradient(120%_160%_at_0%_0%,rgba(226,171,95,0.33)_0%,rgba(126,84,36,0.2)_30%,rgba(19,36,55,0.96)_72%),linear-gradient(135deg,rgba(24,44,64,0.96)_0%,rgba(16,31,46,0.98)_100%)] shadow-[inset_0_0_0_1px_rgba(226,171,95,0.34),0_0_22px_rgba(153,100,37,0.2)]'
  }
  if (value === 2) {
    return 'border-[#cb7e95] bg-[radial-gradient(120%_160%_at_0%_0%,rgba(203,126,149,0.35)_0%,rgba(112,52,71,0.2)_30%,rgba(19,36,55,0.96)_72%),linear-gradient(135deg,rgba(24,44,64,0.96)_0%,rgba(16,31,46,0.98)_100%)] shadow-[inset_0_0_0_1px_rgba(203,126,149,0.35),0_0_22px_rgba(129,55,79,0.2)]'
  }
  return 'border-[#748ea6] bg-[radial-gradient(120%_160%_at_0%_0%,rgba(116,142,166,0.34)_0%,rgba(55,74,94,0.2)_30%,rgba(19,36,55,0.96)_72%),linear-gradient(135deg,rgba(24,44,64,0.96)_0%,rgba(16,31,46,0.98)_100%)] shadow-[inset_0_0_0_1px_rgba(116,142,166,0.34),0_0_20px_rgba(73,94,114,0.18)]'
}

function visibilityOptionClass(option: 0 | 1 | 2 | 3, selected: boolean): string {
  const base =
    'group relative flex h-9 w-[132px] items-center justify-center gap-1.5 rounded border px-2 text-xs font-semibold transition-colors duration-200'

  if (!selected) {
    return `${base} border-[#3a5a76] bg-[#132334] text-[#9fb1bf] hover:bg-[#1a2d40]`
  }

  if (option === 0) {
    return `${base} border-[#55b88f] bg-[#235942] text-[#d9f5e8] shadow-[inset_0_0_0_1px_rgba(85,184,143,0.3)]`
  }
  if (option === 1) {
    return `${base} border-[#e0ac5a] bg-[#5b3f1f] text-[#ffe8bf] shadow-[inset_0_0_0_1px_rgba(224,172,90,0.3)]`
  }
  if (option === 2) {
    return `${base} border-[#ca7a90] bg-[#5a2738] text-[#ffdce6] shadow-[inset_0_0_0_1px_rgba(202,122,144,0.3)]`
  }
  return `${base} border-[#7c9ab2] bg-[#2c4255] text-[#d9e8f4] shadow-[inset_0_0_0_1px_rgba(124,154,178,0.3)]`
}

function visibilityActionClass(value: 0 | 1 | 2 | 3): string {
  if (value === 0) {
    return 'border-[#57b58f] bg-[#2f7858] hover:bg-[#3a9470]'
  }
  if (value === 1) {
    return 'border-[#dca252] bg-[#9c6222] hover:bg-[#ba7629]'
  }
  if (value === 2) {
    return 'border-[#c7748a] bg-[#8d3550] hover:bg-[#a84463]'
  }
  return 'border-[#6f8ba3] bg-[#3f5b73] hover:bg-[#50718c]'
}

function onVisibilityOptionClick(value: 0 | 1 | 2 | 3): void {
  emit('change-visibility-selection', value)
}

const visibilityOptions = [0, 1, 2, 3] as const

const isUpdateMode = computed(() => props.mode === 'update')
const selectedItemDisplay = computed(() => props.selectedWorkshopItem?.title || props.selectedWorkshopItem?.publishedFileId || 'No item selected')
const selectedItemPreviewUrl = computed(() => props.selectedWorkshopItem?.previewUrl || '')
const sectionTitle = computed(() => (isUpdateMode.value ? 'Update Selected Workshop Item' : 'Create Workshop Item'))
const sectionDescription = computed(() =>
  isUpdateMode.value
    ? 'Review and publish changes to this item.'
    : 'Create a new Workshop item. A Published File ID will be assigned by Steam after upload.'
)
const primaryActionLabel = computed(() => (isUpdateMode.value ? 'Update Existing Item' : 'Create New Item'))
const primaryActionDisabled = computed(() => (isUpdateMode.value ? !props.canUpdate : !props.canUpload))
const publishedFileIdValue = computed(() => props.selectedWorkshopItem?.publishedFileId || props.draft.publishedFileId || 'Not selected')

function submitPrimaryAction(): void {
  if (isUpdateMode.value) {
    emit('update-item')
    return
  }
  emit('upload')
}
</script>

<template>
  <section class="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
    <article class="fade-in app-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-md">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-lg font-semibold text-slate-800">{{ sectionTitle }}</h2>
        <button
          v-if="isUpdateMode"
          class="rounded bg-sky-700 px-3 py-1 text-xs font-semibold text-white"
          @click="emit('go-to-mods')"
        >
          Choose Another Mod
        </button>
      </div>

      <p class="mt-2 text-sm text-slate-600">{{ sectionDescription }}</p>

      <div
        v-if="isUpdateMode"
        class="mt-3 rounded-xl border p-4 transition-[background,border-color,box-shadow] duration-500 ease-out"
        :class="visibilityCardClass(visibilityPending)"
      >
        <div class="flex flex-col gap-4">
          <div class="flex min-w-0 flex-1 items-center gap-4">
            <div class="h-32 w-32 shrink-0 overflow-hidden rounded-lg border-2 border-[#5b84a6] bg-[#0f2130]">
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
              <p class="mt-0.5 text-xs text-slate-300">ID: {{ publishedFileIdValue }}</p>
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

      <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <p class="text-sm font-semibold text-slate-800">Publish Readiness</p>
        <ul class="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          <li v-for="item in publishChecklist" :key="item.label" class="flex items-center justify-between rounded-lg border px-3 py-2" :class="item.ok ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'">
            <span>{{ item.label }}</span>
            <span class="text-xs font-semibold" :class="item.ok ? 'text-emerald-700' : 'text-slate-500'">{{ item.ok ? 'Ready' : 'Missing' }}</span>
          </li>
        </ul>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-2">
        <label class="text-sm text-slate-700">
          App ID
          <input v-model="draft.appId" class="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
        </label>
        <label v-if="isUpdateMode" class="text-sm text-slate-700">
          Published File ID
          <input
            :value="publishedFileIdValue"
            class="mt-1 w-full rounded border border-slate-300 px-2 py-1 opacity-80"
            readonly
          />
        </label>
      </div>

      <label class="mt-3 block text-sm text-slate-700">Title</label>
      <input v-model="draft.title" class="mt-1 w-full rounded border border-slate-300 px-2 py-1" />

      <label class="mt-3 block text-sm text-slate-700">Description</label>
      <textarea v-model="draft.description" rows="4" class="mt-1 w-full rounded border border-slate-300 px-2 py-1" />

      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <label class="text-sm text-slate-700">Content Folder (mod root directory)</label>
          <div class="mt-1 flex gap-2">
            <input v-model="draft.contentFolder" class="w-full rounded border border-slate-300 px-2 py-1" />
            <button class="rounded bg-slate-700 px-3 py-1 text-sm font-semibold text-white" @click="emit('pick-content-folder')">Pick</button>
          </div>
        </div>
        <div>
          <label class="text-sm text-slate-700">Preview File</label>
          <div class="mt-1 flex gap-2">
            <input v-model="draft.previewFile" class="w-full rounded border border-slate-300 px-2 py-1" />
            <button class="rounded bg-slate-700 px-3 py-1 text-sm font-semibold text-white" @click="emit('pick-preview-file')">Pick</button>
          </div>
        </div>
      </div>

      <div class="mt-3">
        <label class="text-sm text-slate-700">Tags</label>
        <div class="mt-1 flex gap-2">
          <input :value="tagInput" class="w-full rounded border border-slate-300 px-2 py-1" @input="onTagInput" @keyup.enter="emit('add-tag')" />
          <button class="rounded bg-cyan-600 px-3 py-1 text-sm font-semibold text-white" @click="emit('add-tag')">Add</button>
        </div>
        <div class="mt-2 flex flex-wrap gap-2">
          <button v-for="tag in draft.tags" :key="tag" class="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800" @click="emit('remove-tag', tag)">
            {{ tag }} x
          </button>
        </div>
      </div>

      <div class="mt-4">
        <button
          class="w-full rounded px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          :class="isUpdateMode ? 'bg-sky-700' : 'bg-orange-600'"
          :disabled="primaryActionDisabled"
          @click="submitPrimaryAction"
        >
          {{ primaryActionLabel }}
        </button>
      </div>
    </article>

    <article class="fade-in app-panel h-fit rounded-2xl border border-orange-200 bg-orange-50/70 p-5 shadow-md 2xl:sticky 2xl:top-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold text-orange-900">Upload Workspace</h2>
        <div class="flex gap-2">
          <button class="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white" @click="emit('pick-upload-files')">Select Multiple Files</button>
          <button class="rounded bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" :disabled="uploadFiles.length === 0" @click="emit('use-staged-folder-as-content')">Use Folder as Content Root</button>
          <button class="steam-btn-muted rounded px-3 py-2 text-xs font-semibold disabled:opacity-40" :disabled="uploadFiles.length === 0" @click="emit('clear-upload-files')">Clear</button>
        </div>
      </div>

      <div class="mt-3 cursor-pointer rounded-xl border-2 border-dashed p-4 transition" :class="isUploadDropActive ? 'border-orange-500 bg-orange-100' : 'border-orange-300 bg-white/70'" @dragover="emit('upload-drag-over', $event)" @dragleave="emit('upload-drag-leave', $event)" @drop="emit('upload-drop', $event)" @click="emit('pick-upload-files')">
        <p class="text-sm font-semibold text-orange-900">Drag and drop files to stage upload content</p>
        <p class="mt-1 text-xs text-orange-700">Click to open native multi-file picker.</p>
      </div>

      <div class="mt-3 rounded-lg border border-orange-200 bg-white">
        <div class="flex items-center justify-between border-b border-orange-100 px-3 py-2">
          <p class="text-sm font-semibold text-slate-800">Staged Files</p>
          <p class="text-xs text-slate-500">{{ uploadFiles.length }} item(s)</p>
        </div>
        <div class="max-h-56 overflow-auto px-3 py-2">
          <p v-if="uploadFiles.length === 0" class="text-xs text-slate-500">No files staged yet.</p>
          <ul v-else class="space-y-1 text-xs text-slate-700">
            <li v-for="path in uploadFiles" :key="path" class="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1">
              <div class="min-w-0">
                <p class="truncate font-semibold">{{ fileNameFromPath(path) }}</p>
                <p class="truncate text-slate-500">{{ path }}</p>
              </div>
              <button class="h-6 w-6 shrink-0 rounded-full bg-rose-100 text-xs font-bold text-rose-700" title="Remove file" @click.stop="emit('remove-staged-file', path)">x</button>
            </li>
          </ul>
        </div>
      </div>
    </article>
  </section>
</template>
