<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorkshopItemSummary } from '@shared/contracts'
import type { ContentTreeNode, PublishChecklistItem, StagedContentFile, UploadDraftState } from '../types/ui'
import { formatSizeLabel } from '../utils/size-format'
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
  stagedContentFiles: StagedContentFile[]
  stagedContentTree: ContentTreeNode[]
  totalStagedContentSizeBytes: number
  canUpload: boolean
  canUpdate: boolean
}>()

const emit = defineEmits<{
  (e: 'go-to-mods'): void
  (e: 'pick-content-folder'): void
  (e: 'pick-workspace-root'): void
  (e: 'clear-workspace'): void
  (e: 'pick-preview-file'): void
  (e: 'change-tag-input', value: string): void
  (e: 'add-tag'): void
  (e: 'remove-tag', tag: string): void
  (e: 'upload'): void
  (e: 'update-item'): void
  (e: 'change-visibility-selection', value: 0 | 1 | 2 | 3): void
  (e: 'update-visibility-only'): void
  (e: 'pick-upload-files'): void
  (e: 'clear-upload-files'): void
  (e: 'remove-staged-file', path: string): void
  (e: 'open-content-folder'): void
}>()

interface FlattenedContentNode {
  node: ContentTreeNode
  depth: number
}

function flattenContentTree(
  nodes: ContentTreeNode[],
  collapsedFolderIds: ReadonlySet<string>,
  depth = 0
): FlattenedContentNode[] {
  const rows: FlattenedContentNode[] = []
  for (const node of nodes) {
    rows.push({ node, depth })
    if (
      node.type === 'folder' &&
      node.children &&
      node.children.length > 0 &&
      !collapsedFolderIds.has(node.id)
    ) {
      rows.push(...flattenContentTree(node.children, collapsedFolderIds, depth + 1))
    }
  }
  return rows
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
const readinessTitle = computed(() => (isUpdateMode.value ? 'Update Readiness' : 'Create Readiness'))
const contentFolderValue = computed(() => props.draft.contentFolder.trim())
const hasContentFolder = computed(() => contentFolderValue.value.length > 0)
const primaryActionLabel = computed(() => (isUpdateMode.value ? 'Update Existing Item' : 'Create New Item'))
const primaryActionDisabled = computed(() => (isUpdateMode.value ? !props.canUpdate : !props.canUpload))
const publishedFileIdValue = computed(() => props.selectedWorkshopItem?.publishedFileId || props.draft.publishedFileId || 'Not selected')
const appIdValue = computed(() => props.selectedWorkshopItem?.appId || props.draft.appId || 'Not selected')
const collapsedFolderIds = ref<Set<string>>(new Set())
const flattenedContentNodes = computed(() =>
  flattenContentTree(props.stagedContentTree, collapsedFolderIds.value)
)
const totalContentSizeLabel = computed(() => formatSizeLabel(props.totalStagedContentSizeBytes))
const requiredPublishChecklist = computed(() => props.publishChecklist.filter((item) => !item.optional))
const optionalPublishChecklist = computed(() => props.publishChecklist.filter((item) => item.optional))

const allFolderIds = computed(() => {
  const ids = new Set<string>()
  const walk = (nodes: ContentTreeNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'folder') {
        ids.add(node.id)
        if (node.children && node.children.length > 0) {
          walk(node.children)
        }
      }
    }
  }
  walk(props.stagedContentTree)
  return ids
})

watch(
  allFolderIds,
  (nextFolderIds) => {
    const nextCollapsed = new Set<string>()
    for (const id of collapsedFolderIds.value) {
      if (nextFolderIds.has(id)) {
        nextCollapsed.add(id)
      }
    }
    collapsedFolderIds.value = nextCollapsed
  },
  { immediate: true }
)

function isFolderCollapsed(folderId: string): boolean {
  return collapsedFolderIds.value.has(folderId)
}

function toggleFolder(folderId: string): void {
  const next = new Set(collapsedFolderIds.value)
  if (next.has(folderId)) {
    next.delete(folderId)
  } else {
    next.add(folderId)
  }
  collapsedFolderIds.value = next
}

function readinessItemClass(item: PublishChecklistItem): string {
  if (item.label === 'Release notes' && !hasContentFolder.value) {
    return 'border-[#2a3542] bg-[#0a111a] opacity-60'
  }
  if (item.ok) {
    return 'border-emerald-400/45 bg-emerald-500/18'
  }
  if (item.optional) {
    return 'border-slate-600/70 bg-slate-900/35'
  }
  return 'border-rose-400/45 bg-rose-500/18'
}

function readinessStatusClass(item: PublishChecklistItem): string {
  if (item.label === 'Release notes' && !hasContentFolder.value) {
    return 'text-slate-600'
  }
  if (item.ok) {
    return 'text-emerald-200'
  }
  if (item.optional) {
    return 'text-slate-300'
  }
  return 'text-rose-200'
}

function readinessStatusLabel(item: PublishChecklistItem): string {
  if (item.ok) {
    return 'OK'
  }
  return item.optional ? 'Optional' : 'Missing'
}

function submitPrimaryAction(): void {
  if (isUpdateMode.value) {
    emit('update-item')
    return
  }
  emit('upload')
}
</script>

<template>
  <section class="mt-5 grid gap-5 min-[1220px]:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
    <article class="fade-in app-panel rounded-2xl border border-[#305070] bg-[#1b2838] p-5 shadow-[0_16px_40px_rgba(4,10,20,0.45)]">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-lg font-semibold text-slate-100">{{ sectionTitle }}</h2>
        <button
          v-if="isUpdateMode"
          class="rounded border border-[#78c2f7] bg-[#59b9f8] px-3 py-1 text-xs font-semibold text-[#05253a]"
          @click="emit('go-to-mods')"
        >
          Choose Another Mod
        </button>
      </div>

      <p class="mt-2 text-sm text-slate-300">{{ sectionDescription }}</p>
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

      <div class="mt-4 rounded-xl border border-[#2f4f69] bg-[#1a2b3e] p-4">
        <p class="text-sm font-semibold text-slate-100">{{ readinessTitle }}</p>
        <ul class="mt-3 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
          <li
            v-for="item in requiredPublishChecklist"
            :key="item.label"
            class="flex items-center justify-between rounded-lg border px-3 py-2"
            :class="readinessItemClass(item)"
          >
            <span>{{ item.label }}</span>
            <span class="text-xs font-semibold" :class="readinessStatusClass(item)">{{ readinessStatusLabel(item) }}</span>
          </li>
        </ul>
        <div v-if="optionalPublishChecklist.length > 0" class="mt-3 pb-2">
          <div class="border-t border-[#365572]/70"></div>
        </div>
        <ul v-if="optionalPublishChecklist.length > 0" class="grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
          <li
            v-for="item in optionalPublishChecklist"
            :key="item.label"
            class="flex items-center justify-between rounded-lg border px-3 py-2"
            :class="readinessItemClass(item)"
          >
            <span>{{ item.label }}</span>
            <span class="text-xs font-semibold" :class="readinessStatusClass(item)">{{ readinessStatusLabel(item) }}</span>
          </li>
        </ul>
      </div>

      <div v-if="!isUpdateMode" class="mt-4">
        <label class="text-sm text-slate-300">
          App ID
          <input
            v-model="draft.appId"
            class="mt-1 w-full rounded border border-[#355874] bg-[#0f1f2e] px-2 py-1 text-slate-100"
          />
        </label>
      </div>

      <label class="mt-3 block text-sm text-slate-300">Title</label>
      <input v-model="draft.title" class="mt-1 w-full rounded border border-[#355874] bg-[#0f1f2e] px-2 py-1 text-slate-100" />

      <label class="mt-3 block text-sm text-slate-300">Release Notes (optional)</label>
      <textarea
        v-model="draft.releaseNotes"
        rows="2"
        :disabled="!hasContentFolder"
        :placeholder="hasContentFolder ? '' : 'Select a content folder to enable release notes.'"
        class="mt-1 min-h-[3.5rem] w-full resize-y rounded border border-[#355874] bg-[#0f1f2e] px-2 py-1 text-slate-100 disabled:cursor-not-allowed disabled:border-[#33465a] disabled:bg-[#0c1623] disabled:text-slate-500"
      />

      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <div class="md:col-span-2">
          <label class="text-sm text-slate-300">Preview File (optional)</label>
          <div class="mt-1 flex gap-2">
            <input v-model="draft.previewFile" class="w-full rounded border border-[#355874] bg-[#0f1f2e] px-2 py-1 text-slate-100" />
            <button class="rounded border border-[#4d7ca0] bg-[#2c4d67] px-3 py-1 text-sm font-semibold text-slate-100" @click="emit('pick-preview-file')">Pick</button>
          </div>
        </div>
      </div>

      <div class="mt-3">
        <label class="text-sm text-slate-300">Tags</label>
        <div class="mt-1 flex gap-2">
          <input :value="tagInput" class="w-full rounded border border-[#355874] bg-[#0f1f2e] px-2 py-1 text-slate-100" @input="onTagInput" @keyup.enter="emit('add-tag')" />
          <button class="rounded border border-[#6ecbff] bg-[#59b9f8] px-3 py-1 text-sm font-semibold text-[#05253a]" @click="emit('add-tag')">Add</button>
        </div>
        <div class="mt-2 flex flex-wrap gap-2">
          <button v-for="tag in draft.tags" :key="tag" class="rounded-full border border-[#386487] bg-[#122638] px-3 py-1 text-xs font-semibold text-sky-200" @click="emit('remove-tag', tag)">
            {{ tag }} x
          </button>
        </div>
      </div>

      <div class="mt-4">
        <button
          class="w-full rounded border px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-40"
          :class="isUpdateMode ? 'border-[#78c2f7] bg-[#2c7fb2]' : 'border-[#d18642] bg-[#9b5b22]'"
          :disabled="primaryActionDisabled"
          @click="submitPrimaryAction"
        >
          {{ primaryActionLabel }}
        </button>
      </div>
    </article>

    <article class="fade-in app-panel h-fit rounded-2xl border border-[#ad6f2f] bg-[linear-gradient(135deg,rgba(93,56,21,0.7),rgba(40,32,24,0.82))] p-5 shadow-md xl:p-6 2xl:sticky 2xl:top-4">
      <h2 class="text-xl font-semibold text-orange-200">Content Explorer</h2>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button
          class="flex min-h-[3.25rem] items-center justify-center rounded border border-[#6ecbff] bg-[#59b9f8] px-3 text-center text-sm font-semibold leading-tight text-[#05253a]"
          @click="emit('pick-workspace-root')"
        >
          Choose Content Folder
        </button>
        <button
          class="flex min-h-[3.25rem] items-center justify-center rounded border border-[#6ecbff] bg-[#59b9f8] px-3 text-center text-sm font-semibold leading-tight text-[#05253a] disabled:opacity-40"
          :disabled="!hasContentFolder"
          @click="emit('pick-upload-files')"
        >
          Add Files to Content
        </button>
        <button
          class="flex min-h-[3.25rem] items-center justify-center rounded border border-[#4d7ca0] bg-[#2c4d67] px-3 text-center text-sm font-semibold leading-tight text-slate-100 disabled:opacity-40"
          :disabled="!hasContentFolder && stagedContentFiles.length === 0"
          @click="emit('clear-workspace')"
        >
          Reset Folder
        </button>
        <button
          class="steam-btn-muted flex min-h-[3.25rem] items-center justify-center rounded px-3 text-center text-sm font-semibold leading-tight disabled:opacity-40"
          :disabled="stagedContentFiles.length === 0"
          @click="emit('clear-upload-files')"
        >
          Clear File List
        </button>
      </div>

      <div class="mt-4 rounded-lg border border-[#ad6f2f] bg-[#1f3248] px-3 py-3">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm text-orange-100/85">Selected Content Folder</p>
          <button
            class="rounded border border-[#4d7ca0] bg-[#2c4d67] px-2 py-1 text-xs font-semibold text-slate-100 disabled:opacity-40"
            :disabled="!hasContentFolder"
            @click="emit('open-content-folder')"
          >
            Open Folder
          </button>
        </div>
        <p class="mt-1 select-text break-all text-lg font-semibold text-orange-100">
          {{ hasContentFolder ? contentFolderValue : 'Not selected' }}
        </p>
      </div>

      <div class="mt-4 rounded-lg border border-[#ad6f2f] bg-[#1f3248]">
        <div class="flex w-full items-center justify-between border-b border-[#ad6f2f] px-3 py-2 text-left">
          <span class="text-base font-semibold text-slate-100">Content Explorer</span>
          <span class="flex items-center gap-2 text-sm text-slate-300">
            {{ stagedContentFiles.length }} item(s) • {{ totalContentSizeLabel }}
          </span>
        </div>
        <div class="max-h-72 overflow-auto px-3 py-2 xl:max-h-[24rem]">
          <p v-if="stagedContentFiles.length === 0" class="text-sm text-slate-300">No files staged yet.</p>
          <ul v-else class="space-y-2 text-sm text-slate-200">
            <li
              v-for="{ node, depth } in flattenedContentNodes"
              :key="node.id"
              class="group flex items-center justify-between gap-3 rounded-lg border border-[#355874] bg-[linear-gradient(120deg,#122638,#152d41)] px-3 py-2 transition-colors hover:border-[#5d88ab] hover:bg-[linear-gradient(120deg,#16314a,#1a3850)]"
              :style="{ paddingLeft: `${0.75 + depth * 0.85}rem` }"
            >
              <button
                v-if="node.type === 'folder'"
                type="button"
                class="min-w-0 flex flex-1 items-center gap-2 text-left"
                @click.stop="toggleFolder(node.id)"
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
                <div class="min-w-0 flex-1">
                  <p class="truncate whitespace-nowrap text-[14px] font-semibold text-slate-100">{{ node.name }}</p>
                  <p class="mt-0.5 truncate text-[11px] text-slate-400">{{ node.fileCount }} file(s) • {{ formatSizeLabel(node.sizeBytes) }}</p>
                </div>
              </button>
              <div v-else class="min-w-0 flex flex-1 items-center gap-2">
                <span class="w-4 shrink-0" aria-hidden="true" />
                <svg class="h-4 w-4 shrink-0 text-cyan-200/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M8 3h6l5 5v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
                  <path d="M14 3v6h6" />
                </svg>
                <p class="min-w-0 truncate whitespace-nowrap text-[14px] font-semibold text-slate-100">{{ node.name }}</p>
              </div>
              <div class="flex items-center gap-2">
                <span class="shrink-0 rounded-md border border-[#466887] bg-[#102335] px-2.5 py-0.5 text-xs font-medium text-slate-100">
                  {{ formatSizeLabel(node.sizeBytes) }}
                </span>
                <button
                  v-if="node.type === 'file' && node.absolutePath"
                  class="h-6 w-6 shrink-0 rounded-full border border-rose-300/35 bg-rose-900/45 text-xs font-bold text-rose-100 transition-colors hover:bg-rose-800/70"
                  title="Remove file"
                  @click.stop="emit('remove-staged-file', node.absolutePath)"
                >
                  x
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </article>
  </section>
</template>
