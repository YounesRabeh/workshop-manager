<!--
  Overview: Root Vue component for the Workshop Manager renderer UI.
  Responsibility: Orchestrates auth, workshop browsing,
   publish/update flows, run-log UX, and shared app-level state/composable coordination.
-->
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { RunEvent, WorkshopItemSummary } from '@shared/contracts'
import { evaluateCreateRequirements, evaluateUpdateRequirements } from '@shared/workshop-requirements'
import AppTopBar from './components/AppTopBar.vue'
import CreatePublishSection from './components/publish/sections/CreatePublishSection.vue'
import LoginSection from './components/LoginSection.vue'
import LogsSection from './components/LogsSection.vue'
import UpdatePublishSection from './components/publish/sections/UpdatePublishSection.vue'
import WorkshopItemsSection from './components/WorkshopItemsSection.vue'
import {
  applyDraft,
  cloneDraft,
  createEmptyDraft,
  loadContentFolderFiles,
  useDrafts
} from './composables/useDrafts'
import { useAuthFlow } from './composables/useAuthFlow'
import { useAppBootstrap } from './composables/useAppBootstrap'
import { usePublishActions } from './composables/usePublishActions'
import { useUiShell } from './composables/useUiShell'
import { useWorkshopItems } from './composables/useWorkshopItems'
import './styles/themes/app.theme.css'
import { PublishProgressTracker } from './utils/publish-progress-tracker'
import { formatSizeLabel } from './utils/size-format'
import type {
  FlowStep,
  PublishChecklistItem,
  StagedContentFile
} from './types/ui'

const flowStep = ref<FlowStep>('mods')
const appVersion = ref('dev')
const publishProgress = new PublishProgressTracker()

const {
  createDraft,
  updateDraft,
  updateDraftCache,
  isHydratingUpdateDraft,
  createStagedContentFiles,
  updateStagedContentFiles,
  createTotalStagedContentSizeBytes,
  updateTotalStagedContentSizeBytes,
  createStagedContentTree,
  updateStagedContentTree,
  clearCreatePreviewFile,
  clearUpdatePreviewFile,
  getDraftForMode,
  setStagedFilesForMode,
  clearWorkspaceForMode
} = useDrafts()
const authFlow = useAuthFlow({
  onShowTimeoutLogs: async () => {
    await uiShell.showTimeoutLogs()
  },
  onHideTimeoutLogs: () => {
    uiShell.showLoginLogs.value = false
  },
  onSignedIn: async () => {
    flowStep.value = 'mods'
    await Promise.all([loadWorkshopItems(), authFlow.refreshCurrentProfile()])
  },
  onSignedOut: () => {
    publishProgress.reset()
    selectedWorkshopItemId.value = ''
    publishActions.committedVisibility.value = 0
    publishActions.pendingVisibility.value = 0
    publishActions.createVisibility.value = 2
    workshopItems.value = []
    workshopFilterAppId.value = ''
    workshopVisibilityFilter.value = 'all'
    applyDraft(createDraft, createEmptyDraft())
    applyDraft(updateDraft, createEmptyDraft())
    createStagedContentFiles.value = []
    updateStagedContentFiles.value = []
    updateDraftCache.value = {}
    flowStep.value = 'mods'
    publishActions.isUpdateConfirmOpen.value = false
    publishActions.isCreateConfirmOpen.value = false
  }
})

const {
  loginState,
  steamGuardCode,
  isPasswordPeek,
  isWebApiKeyPeek,
  steamGuardPromptType,
  isStoredSessionLoginAttempt,
  hasPersistedStoredSession,
  isLoginSubmitting,
  statusMessage,
  authIssue,
  isSteamCmdDetected,
  isAdvancedOptionsOpen,
  installLogPath,
  loginForm,
  advancedSettings,
  accountDisplayName,
  accountProfileImageUrl,
  isAuthenticated,
  canAccessMods,
  loginHeaderStatusMessage,
  normalizeError,
  setPasswordPeek,
  setWebApiKeyPeek,
  setWebApiKey,
  setSteamCmdManualPath,
  toggleAdvancedOptions,
  setSteamGuardCode,
  ensureSteamCmdInstalled,
  openInstallLog,
  refreshRememberedLoginState,
  loadAdvancedSettings,
  pickSteamCmdManualPath,
  saveAdvancedSettings,
  clearSavedWebApiKey,
  clearStoredSession,
  loadAppVersion,
  login,
  signOut,
  quitApp,
  submitSteamGuardCode,
  handleRunEvent: handleAuthRunEvent
} = authFlow

const uiShell = useUiShell({
  flowStep,
  isAuthenticated: () => isAuthenticated.value,
  goToStep,
  onFullscreenFailure: () => {
    statusMessage.value = 'Fullscreen toggle failed.'
  }
})

const {
  isFullscreen,
  isAboutOpen,
  activeToast,
  recentRuns,
  selectedRunId,
  selectedRun,
  showLoginLogs,
  statusBadgeClass,
  formatRunTimestamp,
  selectRun,
  refreshRunLogs,
  toggleFullscreen,
  openAboutModal,
  closeAboutModal,
  toastToneClass,
  showToast,
  mountGlobalListeners,
  unmountGlobalListeners
} = uiShell

const { isBootstrapping } = useAppBootstrap({
  appVersion,
  mountGlobalListeners,
  unmountGlobalListeners,
  handleRunEvent,
  ensureSteamCmdInstalled,
  refreshRememberedLoginState,
  loadAdvancedSettings,
  loadAppVersion,
  setStatusMessage: (message) => {
    statusMessage.value = message
  }
})

const workshopStore = useWorkshopItems({
  canAccessMods: () => canAccessMods.value,
  normalizeError,
  setStatusMessage: (message) => {
    statusMessage.value = message
  },
  onSelectWorkshopItem: (item) => {
    hydrateSelectedWorkshopItem(item)
  }
})
const workshopFilterAppId = workshopStore.workshopFilterAppId
const workshopVisibilityFilter = workshopStore.workshopVisibilityFilter
const workshopItems = workshopStore.workshopItems
const selectedWorkshopItemId = workshopStore.selectedWorkshopItemId
const workshopListMessage = workshopStore.workshopListMessage
const filteredWorkshopItems = workshopStore.filteredWorkshopItems
const onChangeAppId = workshopStore.onChangeAppId
const onChangeWorkshopVisibilityFilter = workshopStore.onChangeWorkshopVisibilityFilter
const selectedWorkshopItem = workshopStore.selectedWorkshopItem
const canAccessUpdate = computed(() => canAccessMods.value && selectedWorkshopItemId.value.trim().length > 0)
const createRequirements = computed(() => evaluateCreateRequirements(createDraft))
const updateRequirements = computed(() => evaluateUpdateRequirements(updateDraft))
const workshopItemsEmptyStateMessage = computed(() => {
  if (filteredWorkshopItems.value.length > 0) {
    return ''
  }

  const explicitMessage = workshopListMessage.value.trim()
  if (explicitMessage.length > 0) {
    return explicitMessage
  }

  return 'No workshop items found for the current filters.'
})
const shouldShowWorkshopItemsEmptyState = computed(() => {
  if (filteredWorkshopItems.value.length > 0) {
    return false
  }

  return workshopListMessage.value.trim().length > 0 || workshopItems.value.length > 0
})

function normalizeComparableTitle(value: string | undefined): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

const hasMeaningfulUpdateTitleChange = computed(() => {
  const selectedTitle = normalizeComparableTitle(selectedWorkshopItem.value?.title)
  const draftTitle = normalizeComparableTitle(updateDraft.title)
  if (!selectedTitle || !draftTitle) {
    return false
  }
  return selectedTitle !== draftTitle
})

const hasPendingUpdateChanges = computed(() => {
  const selectedItem = selectedWorkshopItem.value
  if (!selectedItem) {
    return false
  }

  const contentFolderChanged = updateDraft.contentFolder.trim().length > 0
  const previewChanged = updateDraft.previewFile.trim().length > 0
  const releaseNotesChanged = updateDraft.releaseNotes.trim().length > 0
  const titleChanged = hasMeaningfulUpdateTitleChange.value

  const appIdChanged =
    updateDraft.appId.trim() !== (selectedItem.appId?.trim() ?? '')
  const publishedFileIdChanged =
    updateDraft.publishedFileId.trim() !== selectedItem.publishedFileId.trim()

  return (
    contentFolderChanged ||
    previewChanged ||
    releaseNotesChanged ||
    titleChanged ||
    appIdChanged ||
    publishedFileIdChanged
  )
})

const publishActions = usePublishActions({
  loginState,
  selectedWorkshopItemId,
  selectedWorkshopItem,
  workshopItems,
  workshopFilterAppId,
  createDraft,
  updateDraft,
  createRequirements,
  updateRequirements,
  hasPendingUpdateChanges,
  updateDraftCache,
  normalizeError,
  setStatusMessage: (message) => {
    statusMessage.value = message
  },
  showToast,
  onSelectWorkshopItem: (item) => {
    selectWorkshopItem(item)
  }
})

const {
  committedVisibility,
  pendingVisibility,
  createVisibility,
  isUpdateConfirmOpen,
  isCreateConfirmOpen,
  canChangeVisibility,
  visibilityLabel,
  setPendingVisibility,
  setCreateVisibility,
  setVisibilityFromSelection,
  canCreate,
  canUpdate,
  openCreateConfirmation,
  closeCreateConfirmation,
  confirmCreateItem,
  openUpdateConfirmation,
  closeUpdateConfirmation,
  confirmUpdateItem,
  updateVisibilityOnly
} = publishActions

const updateChecklist = computed<PublishChecklistItem[]>(() => {
  return [
    { label: 'App ID', ok: updateRequirements.value.appId },
    { label: 'Title', ok: hasMeaningfulUpdateTitleChange.value, optional: true },
    { label: 'Content folder or Thumbnail', ok: updateRequirements.value.contentOrPreview, optional: true },
    { label: 'Release notes', ok: updateDraft.releaseNotes.trim().length > 0, optional: true }
  ]
})

const createChecklist = computed<PublishChecklistItem[]>(() => {
  return [
    { label: 'App ID', ok: createRequirements.value.appId },
    { label: 'Title', ok: createRequirements.value.title },
    { label: 'Content folder', ok: createRequirements.value.contentFolder },
    { label: 'Release notes', ok: createDraft.releaseNotes.trim().length > 0, optional: true },
    { label: 'Preview image', ok: createDraft.previewFile.trim().length > 0, optional: true },
  ]
})

const publishProgressVisible = publishProgress.visible
const publishProgressPercent = publishProgress.percent
const publishProgressLabel = publishProgress.label
const publishProgressTitle = publishProgress.title

function handleRunEvent(event: RunEvent): void {
  handleAuthRunEvent(event)
  publishProgress.handleRunEvent(event)
}

onUnmounted(() => {
  publishProgress.destroy()
})

function goToStep(step: FlowStep): void {
  if (!isAuthenticated.value) {
    statusMessage.value = 'Login required.'
    return
  }

  if (step === 'update' && !canAccessUpdate.value) {
    statusMessage.value = 'Select an item from Mod List first.'
    return
  }

  if (step === 'update' && selectedWorkshopItemId.value.trim().length > 0 && updateDraft.publishedFileId.trim().length === 0) {
    updateDraft.publishedFileId = selectedWorkshopItemId.value
  }

  flowStep.value = step
}

function setStagedContentFilesFromFolder(mode: 'create' | 'update', contentFolder: string, files: StagedContentFile[]): void {
  setStagedFilesForMode(mode, files)
  if (files.length === 0) {
    statusMessage.value = `Content folder selected: ${contentFolder}. No files found.`
    return
  }
  const totalSize = files.reduce((sum, file) => sum + file.sizeBytes, 0)
  statusMessage.value = `Loaded ${files.length} content file(s), ${formatSizeLabel(totalSize)} total.`
}

function setContentFolderSelectionError(mode: 'create' | 'update', contentFolder: string, message: string): void {
  setStagedFilesForMode(mode, [])
  statusMessage.value = `Content folder selected: ${contentFolder}. Scan failed: ${message}`
}

async function loadWorkshopItems(): Promise<void> {
  await workshopStore.loadWorkshopItems()
  const selectedId = selectedWorkshopItemId.value.trim()
  const hasCurrentSelection =
    selectedId.length > 0 &&
    workshopItems.value.some((item) => item.publishedFileId === selectedId)

  if (!hasCurrentSelection && workshopItems.value.length > 0) {
    hydrateSelectedWorkshopItem(workshopItems.value[0], { navigateToUpdate: false })
  }
}

async function resetWorkshopAppIdFilter(): Promise<void> {
  await workshopStore.resetAppIdFilter()
}

function hydrateSelectedWorkshopItem(
  item: WorkshopItemSummary,
  options: { navigateToUpdate?: boolean } = {}
): void {
  selectedWorkshopItemId.value = item.publishedFileId
  const cached = updateDraftCache.value[item.publishedFileId]
  const visibility = item.visibility ?? 0

  isHydratingUpdateDraft.value = true
  if (cached) {
    applyDraft(updateDraft, cached)
  } else {
    applyDraft(updateDraft, {
      ...createEmptyDraft(),
      appId: item.appId ?? '',
      publishedFileId: item.publishedFileId,
      title: item.title
    })
  }
  isHydratingUpdateDraft.value = false

  setVisibilityFromSelection(visibility)
  statusMessage.value = `Loaded workshop item: ${item.title}`
  if (options.navigateToUpdate !== false) {
    flowStep.value = 'update'
  }
}

function selectWorkshopItem(item: WorkshopItemSummary): void {
  workshopStore.selectWorkshopItem(item)
}

async function pickContentFolderForMode(mode: 'create' | 'update'): Promise<void> {
  const path = await window.workshop.pickFolder()
  if (path) {
    const draft = getDraftForMode(mode)
    draft.contentFolder = path
    try {
      const files = await loadContentFolderFiles(path)
      setStagedContentFilesFromFolder(mode, path, files)
    } catch (error) {
      const parsed = normalizeError(error)
      setContentFolderSelectionError(mode, path, parsed.message)
    }
  }
}

async function openSelectedWorkshopItem(): Promise<void> {
  await workshopStore.openSelectedWorkshopItem()
}

async function refreshSelectedWorkshopItem(): Promise<void> {
  await workshopStore.refreshSelectedWorkshopItem()
}

async function pickCreatePreviewFile(): Promise<void> {
  const path = await window.workshop.pickFile()
  if (path) {
    createDraft.previewFile = path
  }
}

async function pickCreateContentFolder(): Promise<void> {
  await pickContentFolderForMode('create')
}

async function pickUpdateContentFolder(): Promise<void> {
  await pickContentFolderForMode('update')
}

function clearCreateWorkspace(): void {
  clearWorkspaceForMode('create')
  statusMessage.value = 'Mod content cleared.'
}

function clearUpdateWorkspace(): void {
  clearWorkspaceForMode('update')
  statusMessage.value = 'Mod content cleared.'
}

async function pickUpdatePreviewFile(): Promise<void> {
  const path = await window.workshop.pickFile()
  if (path) {
    updateDraft.previewFile = path
  }
}

watch(
  updateDraft,
  () => {
    if (isHydratingUpdateDraft.value) {
      return
    }
    const itemId = selectedWorkshopItemId.value.trim()
    if (!itemId) {
      return
    }
    updateDraftCache.value[itemId] = cloneDraft(updateDraft)
  },
  { deep: true }
)
</script>

<template>
  <main class="steam-theme">
    <section v-if="isBootstrapping" class="fade-in splash-screen">
      <div class="splash-panel">
        <p class="splash-kicker">WORKSHOP MANAGER</p>
        <h1 class="splash-title">Initializing</h1>
        <p class="splash-subtitle">Preparing SteamCMD and saved session data...</p>
        <div class="splash-loader" role="status" aria-label="Loading">
          <span class="splash-loader-dot"></span>
          <span class="splash-loader-dot"></span>
          <span class="splash-loader-dot"></span>
        </div>
      </div>
      <p class="splash-disclaimer">* Not an official Steam product</p>
    </section>

    <template v-else-if="!isAuthenticated">
      <LoginSection
        :status-message="loginHeaderStatusMessage"
        :app-version="appVersion"
        :is-login-submitting="isLoginSubmitting"
        :login-form="loginForm"
        :is-password-peek="isPasswordPeek"
        :auth-issue="authIssue"
        :steam-guard-prompt-type="steamGuardPromptType"
        :steam-guard-code="steamGuardCode"
        :is-stored-session-login-attempt="isStoredSessionLoginAttempt"
        :can-clear-stored-session="hasPersistedStoredSession"
        :is-advanced-options-open="isAdvancedOptionsOpen"
        :advanced-settings="advancedSettings"
        :is-web-api-key-peek="isWebApiKeyPeek"
        :install-log-path="installLogPath"
        @submit-login="login"
        @set-password-peek="setPasswordPeek"
        @submit-guard-code="submitSteamGuardCode"
        @update-steam-guard-code="setSteamGuardCode"
        @toggle-advanced-options="toggleAdvancedOptions"
        @update-web-api-key="setWebApiKey"
        @update-steamcmd-manual-path="setSteamCmdManualPath"
        @pick-steamcmd-manual-path="pickSteamCmdManualPath"
        @set-web-api-key-peek="setWebApiKeyPeek"
        @save-advanced-settings="saveAdvancedSettings"
        @clear-web-api-key="clearSavedWebApiKey"
        @open-install-log="openInstallLog"
        @clear-stored-session="clearStoredSession"
        @quit-app="quitApp"
      />
      <div v-if="showLoginLogs" class="app-shell pb-6">
        <LogsSection
          :recent-runs="recentRuns"
          :selected-run-id="selectedRunId"
          :selected-run="selectedRun"
          :format-run-timestamp="formatRunTimestamp"
          :status-badge-class="statusBadgeClass"
          @refresh="refreshRunLogs"
          @select-run="selectRun"
        />
      </div>
    </template>

    <template v-else>
      <div class="app-shell">
        <div
          v-if="activeToast"
          class="pointer-events-none fixed left-1/2 top-4 z-[70] w-[340px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border px-4 py-3 text-center shadow-2xl backdrop-blur-sm"
          :class="toastToneClass(activeToast.tone)"
        >
          <p class="text-sm font-bold">{{ activeToast.title }}</p>
          <p class="mt-1 text-xs opacity-95">{{ activeToast.detail }}</p>
        </div>

        <AppTopBar
          :flow-step="flowStep"
          :can-access-update="canAccessUpdate"
          :account-display-name="accountDisplayName"
          :workshop-items-count="workshopItems.length"
          :app-version="appVersion"
          :is-fullscreen="isFullscreen"
          :is-dev-mode="advancedSettings.hasWebApiKey"
          :profile-image-url="accountProfileImageUrl"
          @navigate="goToStep"
          @open-about="openAboutModal"
          @toggle-fullscreen="toggleFullscreen"
          @sign-out="signOut"
        />

        <section
          v-if="publishProgressVisible"
          class="my-5 rounded-xl border border-[#2c4b63] bg-[linear-gradient(180deg,rgba(27,45,63,0.94)_0%,rgba(16,30,43,0.94)_100%)] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(102,192,244,0.22)]"
          role="status"
          aria-live="polite"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#95c6e7]">
              {{ publishProgressTitle }}
            </p>
            <p class="text-xs font-bold text-[#dff1fc]">{{ publishProgressPercent }}%</p>
          </div>
          <div class="mt-2 h-2 overflow-hidden rounded-full border border-[#305777] bg-[#0f1c2b]">
            <div
              class="h-full rounded-full bg-[linear-gradient(90deg,#3f90bf_0%,#66c0f4_55%,#7dd4ff_100%)] transition-[width] duration-200 ease-out"
              :style="{ width: `${publishProgressPercent}%` }"
            ></div>
          </div>
          <p class="mt-2 text-xs text-slate-300">{{ publishProgressLabel }}</p>
        </section>

        <WorkshopItemsSection
          v-if="flowStep === 'mods'"
          :app-id="workshopFilterAppId"
          :workshop-items="filteredWorkshopItems"
          :all-items-count="workshopItems.length"
          :visibility-filter="workshopVisibilityFilter"
          :selected-workshop-item-id="selectedWorkshopItemId"
          :empty-state-message="workshopItemsEmptyStateMessage"
          :show-empty-state="shouldShowWorkshopItemsEmptyState"
          @change-app-id="onChangeAppId"
          @change-visibility-filter="onChangeWorkshopVisibilityFilter"
          @reset-filter="resetWorkshopAppIdFilter"
          @refresh="loadWorkshopItems"
          @select-item="selectWorkshopItem"
        />

        <UpdatePublishSection
          v-if="flowStep === 'update'"
          :selected-workshop-item="selectedWorkshopItem"
          :publish-checklist="updateChecklist"
          :draft="updateDraft"
          :visibility-committed="committedVisibility"
          :visibility-pending="pendingVisibility"
          :can-change-visibility="canChangeVisibility"
          :staged-content-files="updateStagedContentFiles"
          :staged-content-tree="updateStagedContentTree"
          :total-staged-content-size-bytes="updateTotalStagedContentSizeBytes"
          :can-update="canUpdate()"
          @go-to-mods="goToStep('mods')"
          @refresh-workshop-item="refreshSelectedWorkshopItem"
          @open-workshop-item="openSelectedWorkshopItem"
          @pick-workspace-root="pickUpdateContentFolder"
          @clear-workspace="clearUpdateWorkspace"
          @pick-preview-file="pickUpdatePreviewFile"
          @clear-preview-file="clearUpdatePreviewFile"
          @change-visibility-selection="setPendingVisibility"
          @update-visibility-only="updateVisibilityOnly"
          @update-item="openUpdateConfirmation"
        />

        <CreatePublishSection
          v-if="flowStep === 'create'"
          :publish-checklist="createChecklist"
          :draft="createDraft"
          :visibility-pending="createVisibility"
          :staged-content-files="createStagedContentFiles"
          :staged-content-tree="createStagedContentTree"
          :total-staged-content-size-bytes="createTotalStagedContentSizeBytes"
          :can-upload="canCreate()"
          @pick-workspace-root="pickCreateContentFolder"
          @clear-workspace="clearCreateWorkspace"
          @pick-preview-file="pickCreatePreviewFile"
          @clear-preview-file="clearCreatePreviewFile"
          @change-visibility-selection="setCreateVisibility"
          @upload="openCreateConfirmation"
        />

        <div
          v-if="isUpdateConfirmOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          @click.self="closeUpdateConfirmation"
        >
          <article class="w-full max-w-md rounded-xl border border-[#2a475e] bg-[#162534] p-5 shadow-2xl">
            <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Confirm Update</p>
            <h2 class="mt-1 text-xl font-bold text-slate-100">Update Workshop Item?</h2>
            <p class="mt-2 text-sm text-slate-300">
              You are about to update:
              <span class="font-semibold text-slate-100">{{ selectedWorkshopItem?.title || updateDraft.title || 'Selected item' }}</span>
            </p>
            <p class="mt-2 text-xs text-slate-400">This will push your current draft metadata/content to Steam Workshop.</p>
            <div class="mt-4 flex justify-end gap-2">
              <button class="steam-btn-muted rounded px-3 py-1.5 text-xs font-semibold" @click="closeUpdateConfirmation">
                Cancel
              </button>
              <button
                class="rounded border border-[#78c2f7] bg-[#2c7fb2] px-3 py-1.5 text-xs font-semibold text-slate-100"
                @click="confirmUpdateItem"
              >
                Update Item
              </button>
            </div>
          </article>
        </div>

        <div
          v-if="isCreateConfirmOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          @click.self="closeCreateConfirmation"
        >
          <article class="w-full max-w-md rounded-xl border border-[#2a475e] bg-[#162534] p-5 shadow-2xl">
            <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Confirm Create</p>
            <h2 class="mt-1 text-xl font-bold text-slate-100">Create Workshop Item?</h2>
            <p class="mt-2 text-sm text-slate-300">
              You are about to create:
              <span class="font-semibold text-slate-100">{{ createDraft.title || 'New item' }}</span>
            </p>
            <p class="mt-2 text-xs text-slate-400">This will upload a new workshop item with your current create draft settings.</p>
            <div class="mt-4 flex justify-end gap-2">
              <button class="steam-btn-muted rounded px-3 py-1.5 text-xs font-semibold" @click="closeCreateConfirmation">
                Cancel
              </button>
              <button
                class="rounded border border-[#78c2f7] bg-[#2c7fb2] px-3 py-1.5 text-xs font-semibold text-slate-100"
                @click="confirmCreateItem"
              >
                Create Item
              </button>
            </div>
          </article>
        </div>

        <div
          v-if="isAboutOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          @click.self="closeAboutModal"
        >
          <article class="w-full max-w-md rounded-xl border border-[#2a475e] bg-[#162534] p-5 shadow-2xl">
            <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">About</p>
            <h2 class="mt-1 text-xl font-bold text-slate-100">Workshop Manager</h2>
            <p class="mt-2 text-sm text-slate-300">
              Developer utility for Steam Workshop uploads and updates.
            </p>
            <p class="mt-2 text-xs text-slate-400">
              Version: <span class="font-semibold text-slate-200">v{{ appVersion || 'dev' }}</span>
            </p>
            <p class="mt-3 text-xs text-slate-400">* Not an official Steam product.</p>
            <div class="mt-4 flex justify-end">
              <button class="steam-btn-muted rounded px-3 py-1.5 text-xs font-semibold" @click="closeAboutModal">Close</button>
            </div>
          </article>
        </div>
      </div>
    </template>
  </main>
</template>
