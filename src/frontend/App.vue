<!--
  Overview: Root Vue component for the Workshop Manager renderer UI.
  Responsibility: Acts as the renderer shell that wires auth, workshop browsing,
   publish/update flows, run-log UX, and shared app-level state across specialized composables.
  Design note: Business rules live in composables and child sections stay mostly presentational;
   this file focuses on top-level coordination, shared event routing, and screen branching.
-->
<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { RunEvent, WorkshopItemSummary } from '@shared/contracts'
import { evaluateCreateRequirements, evaluateUpdateRequirements } from '@shared/workshop-requirements'
import AppTopBar from './components/AppTopBar.vue'
import AboutDialog from './components/dialogs/AboutDialog.vue'
import ActionConfirmDialog from './components/dialogs/ActionConfirmDialog.vue'
import CreatePublishSection from './components/publish/sections/CreatePublishSection.vue'
import LoginSection from './components/LoginSection.vue'
import LogsSection from './components/LogsSection.vue'
import SettingsSection from './components/settings/sections/SettingsSection.vue'
import UpdatePublishSection from './components/publish/sections/UpdatePublishSection.vue'
import WorkshopItemsSection from './components/WorkshopItemsSection.vue'
import {
  loadContentFolderFiles,
  useDrafts
} from './composables/useDrafts'
import { useAuthFlow } from './composables/useAuthFlow'
import { useAdvancedSettings } from './composables/useAdvancedSettings'
import { useAppBootstrap } from './composables/useAppBootstrap'
import { usePublishActions } from './composables/usePublishActions'
import { usePublishOrchestration } from './composables/usePublishOrchestration'
import { useUiShell } from './composables/useUiShell'
import { useUpdateDraftCoordinator } from './composables/useUpdateDraftCoordinator'
import { useWorkshopItems } from './composables/useWorkshopItems'
import './styles/themes/app.theme.css'
import './components/publish/styles/publish-section.shared.css'
import { formatSizeLabel } from './utils/size-format'
import type {
  PublishChecklistItem,
  StagedContentFile
} from './types/ui'

const appVersion = ref('dev')

// Draft state is shared across create/update screens and survives navigation
// between steps, so the root shell owns it and passes slices downward.
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
  resetDraftsState,
  setDraftField,
  setStagedFilesForMode,
  toggleStagedFileForMode,
  clearWorkspaceForMode
} = useDrafts()

// These late-bound callbacks let independently-scoped composables notify one
// another without collapsing the entire app shell into a single mega-composable.
/** Handles show timeout logs events from the application. */
let showTimeoutLogsHandler: () => Promise<void> = async () => undefined
/** Handles hide timeout logs events from the application. */
let hideTimeoutLogsHandler: () => void = () => undefined
/** Handles signed in events from the application. */
let signedInHandler: () => Promise<void> = async () => undefined
/** Handles signed out events from the application. */
let signedOutHandler: () => void = () => undefined
let openAdvancedOptionsHandler: (() => void) | null = null

const authFlow = useAuthFlow({
  /** Shows SteamCMD timeout diagnostics when the auth flow requests them. */
  onShowTimeoutLogs: async () => showTimeoutLogsHandler(),
  /** Hides SteamCMD timeout diagnostics when the auth flow closes them. */
  onHideTimeoutLogs: () => hideTimeoutLogsHandler(),
  /** Refreshes profile and Workshop state after authentication succeeds. */
  onSignedIn: async () => signedInHandler(),
  /** Clears profile and Workshop state after sign-out. */
  onSignedOut: () => signedOutHandler(),
  /** Opens advanced settings when login requires a SteamCMD path. */
  onSteamCmdPathRequired: () => {
    openAdvancedOptionsHandler?.()
  }
})

const {
  loginState,
  steamGuardCode,
  isPasswordPeek,
  steamGuardPromptType,
  preferredAuthMode,
  activeChallengeMode,
  isStoredSessionLoginAttempt,
  hasPersistedStoredSession,
  isLoginSubmitting,
  statusMessage,
  authIssue,
  loginForm,
  accountDisplayName,
  accountProfileImageUrl,
  isAuthenticated,
  canAccessMods,
  normalizeError,
  canUseStoredSessionForLogin,
  setLoginUsername,
  setLoginPassword,
  setRememberUsername,
  setRememberAuth,
  setPreferredAuthMode,
  setPasswordPeek,
  setSteamGuardCode,
  refreshRememberedLoginState,
  clearStoredSession,
  refreshCurrentProfile,
  loadAppVersion,
  login,
  signOut,
  quitApp,
  submitSteamGuardCode,
  handleRunEvent: handleAuthRunEvent
} = authFlow

const isWebApiKeyPeek = ref(false)

/** Shows or masks the Web API key in the settings form. */
function setWebApiKeyPeek(value: boolean): void {
  isWebApiKeyPeek.value = value
}

/** Handles can access update events from the application. */
let canAccessUpdateHandler: () => boolean = () => false
/** Handles selected Workshop item ID events from the application. */
let selectedWorkshopItemIdHandler: () => string = () => ''
/** Handles update draft published file ID events from the application. */
let updateDraftPublishedFileIdHandler: () => string = () => ''
/** Handles set update draft published file ID events from the application. */
let setUpdateDraftPublishedFileIdHandler: (value: string) => void = () => undefined
/** Handles signed in refresh events from the application. */
let signedInRefreshHandler: () => Promise<void> = async () => undefined
/** Handles signed out reset events from the application. */
let signedOutResetHandler: () => void = () => undefined

const {
  flowStep,
  publishProgressVisible,
  publishProgressPercent,
  publishProgressLabel,
  publishProgressTitle,
  goToStep,
  handlePublishRunEvent,
  handleSignedIn,
  handleSignedOut,
  setFlowStep,
  destroy: destroyPublishOrchestration
} = usePublishOrchestration({
  /** Supplies the current authentication state to publish orchestration. */
  isAuthenticated: () => isAuthenticated.value,
  /** Supplies whether the selected Workshop item can be updated. */
  canAccessUpdate: () => canAccessUpdateHandler(),
  /** Supplies the currently selected Workshop item ID. */
  getSelectedWorkshopItemId: () => selectedWorkshopItemIdHandler(),
  /** Supplies the published-file ID currently stored in the update draft. */
  getUpdateDraftPublishedFileId: () => updateDraftPublishedFileIdHandler(),
  /** Copies the selected item's published-file ID into the update draft. */
  setUpdateDraftPublishedFileId: (value) => {
    setUpdateDraftPublishedFileIdHandler(value)
  },
  /** Updates the status message shared by the application shell. */
  setStatusMessage: (message) => {
    statusMessage.value = message
  },
  /** Refreshes authenticated data after sign-in completes. */
  onSignedInRefresh: async () => signedInRefreshHandler(),
  /** Clears authenticated data after sign-out completes. */
  onSignedOutReset: () => signedOutResetHandler()
})

const {
  isSteamCmdDetected,
  isAdvancedOptionsOpen,
  installLogPath,
  advancedSettings,
  setWebApiKey,
  setSteamCmdManualPath,
  setLoginTimeoutMs,
  setStoredSessionTimeoutMs,
  setWorkshopTimeoutMs,
  toggleAdvancedOptions,
  openAdvancedOptions,
  ensureSteamCmdInstalled,
  openInstallLog,
  loadAdvancedSettings,
  pickSteamCmdManualPath,
  saveAdvancedSettings,
  clearSavedWebApiKey
} = useAdvancedSettings({
  normalizeError,
  /** Updates the status message shared by the application shell. */
  setStatusMessage: (message) => {
    statusMessage.value = message
  }
})

openAdvancedOptionsHandler = openAdvancedOptions

const loginHeaderStatusMessage = computed(() => {
  if (isSteamCmdDetected.value) {
    return 'SteamCMD found'
  }

  if (/SteamCMD not found/i.test(statusMessage.value)) {
    return 'SteamCMD not found'
  }

  return ''
})

const uiShell = useUiShell({
  flowStep,
  /** Supplies the current authentication state to the app shell. */
  isAuthenticated: () => isAuthenticated.value,
  goToStep,
  /** Displays an error when the browser cannot change fullscreen state. */
  onFullscreenFailure: () => {
    statusMessage.value = 'Fullscreen toggle failed.'
  }
})

const {
  isFullscreen,
  isAboutOpen,
  activeToast,
  runLogs,
  selectedRunId,
  selectedRun,
  showRunLogs,
  statusBadgeClass,
  formatRunTimestamp,
  selectRun,
  refreshRunLogs,
  openRunLogs,
  closeRunLogs,
  toggleFullscreen,
  openAboutModal,
  closeAboutModal,
  toastToneClass,
  showToast,
  mountGlobalListeners,
  unmountGlobalListeners
} = uiShell

// Bootstrap runs after auth and shell wiring exist so startup listeners can
// immediately fan out incoming run events to the right domain handlers.
const { isBootstrapping } = useAppBootstrap({
  appVersion,
  mountGlobalListeners,
  unmountGlobalListeners,
  handleRunEvent,
  ensureSteamCmdInstalled,
  refreshRememberedLoginState,
  loadAdvancedSettings,
  loadAppVersion,
  /** Updates the status message shared by the application shell. */
  setStatusMessage: (message) => {
    statusMessage.value = message
  }
})

// These three composables form the authenticated workshop loop:
// browse/select an item, derive publish affordances, then hydrate/sync update drafts.
const workshopStore = useWorkshopItems({
  /** Supplies whether the current session may browse Workshop items. */
  canAccessMods: () => canAccessMods.value,
  normalizeError,
  /** Updates the status message shared by the application shell. */
  setStatusMessage: (message) => {
    statusMessage.value = message
  },
  /** Hydrates the update draft when a Workshop item is selected. */
  onSelectWorkshopItem: (item) => {
    hydrateSelectedWorkshopItem(item)
  }
})
const workshopFilterAppId = workshopStore.workshopFilterAppId
const workshopVisibilityFilter = workshopStore.workshopVisibilityFilter
const workshopItems = workshopStore.workshopItems
const workshopItemsTotalCount = workshopStore.workshopItemsTotalCount
const selectedWorkshopItemId = workshopStore.selectedWorkshopItemId
const workshopListMessage = workshopStore.workshopListMessage
const filteredWorkshopItems = workshopStore.filteredWorkshopItems
const paginatedWorkshopItems = workshopStore.paginatedWorkshopItems
const workshopItemsPage = workshopStore.workshopItemsPage
const workshopItemsTotalPages = workshopStore.workshopItemsTotalPages
const workshopItemsPageStart = workshopStore.workshopItemsPageStart
const workshopItemsPageEnd = workshopStore.workshopItemsPageEnd
const goToWorkshopItemsPage = workshopStore.goToWorkshopItemsPage
const onChangeAppId = workshopStore.onChangeAppId
const onChangeWorkshopVisibilityFilter = workshopStore.onChangeWorkshopVisibilityFilter
const selectedWorkshopItem = workshopStore.selectedWorkshopItem
const resetWorkshopState = workshopStore.resetWorkshopState
const canAccessUpdate = computed(() => canAccessMods.value && selectedWorkshopItem.value !== undefined)
canAccessUpdateHandler = () => canAccessUpdate.value
selectedWorkshopItemIdHandler = () => selectedWorkshopItemId.value
updateDraftPublishedFileIdHandler = () => updateDraft.publishedFileId
setUpdateDraftPublishedFileIdHandler = (value: string) => {
  updateDraft.publishedFileId = value
}
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
/** Handles has pending update changes events from the application. */
let hasPendingUpdateChangesHandler: () => boolean = () => false
/** Handles set visibility from selection events from the application. */
let setVisibilityFromSelectionHandler: (value: 0 | 1 | 2 | 3) => void = () => undefined

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
  /** Supplies whether the update draft differs from the selected item's saved details. */
  hasPendingUpdateChanges: () => hasPendingUpdateChangesHandler(),
  updateDraftCache,
  createStagedContentFiles,
  updateStagedContentFiles,
  /** Updates the status message shared by the application shell. */
  setStatusMessage: (message) => {
    statusMessage.value = message
  },
  showToast,
  /** Updates the selected item when a publish action refreshes Workshop data. */
  onSelectWorkshopItem: (item) => {
    selectWorkshopItem(item)
  },
  reloadWorkshopPage: loadWorkshopItems
})

const {
  committedVisibility,
  pendingVisibility,
  createVisibility,
  isUpdateConfirmOpen,
  isCreateConfirmOpen,
  canChangeVisibility,
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
  updateVisibilityOnly,
  resetPublishActionState
} = publishActions

const updateFlowCoordinator = useUpdateDraftCoordinator({
  flowStep,
  selectedWorkshopItemId,
  selectedWorkshopItem,
  workshopItems,
  updateDraft,
  updateDraftCache,
  isHydratingUpdateDraft,
  /** Keeps the draft visibility choices aligned with the selected Workshop item. */
  setVisibilityFromSelection: (value) => setVisibilityFromSelectionHandler(value),
  /** Updates the status message shared by the application shell. */
  setStatusMessage: (message) => {
    statusMessage.value = message
  }
})
const {
  hasMeaningfulUpdateTitleChange,
  hasPendingUpdateChanges,
  hydrateSelectedWorkshopItem,
  reconcileWorkshopSelection
} = updateFlowCoordinator
hasPendingUpdateChangesHandler = () => hasPendingUpdateChanges.value
setVisibilityFromSelectionHandler = setVisibilityFromSelection

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

showTimeoutLogsHandler = async () => {
  await openRunLogs()
}
hideTimeoutLogsHandler = () => {
  closeRunLogs()
}
signedInRefreshHandler = async () => {
  await Promise.all([loadWorkshopItems(), refreshCurrentProfile()])
}
signedOutResetHandler = () => {
  resetPublishActionState()
  resetWorkshopState()
  resetDraftsState()
}
signedInHandler = handleSignedIn
signedOutHandler = handleSignedOut

/**
 * Run events can describe either auth progress or publish progress, so the root
 * shell fans each backend event out to both domains.
 */
function handleRunEvent(event: RunEvent): void {
  handleAuthRunEvent(event)
  handlePublishRunEvent(event)
}

onUnmounted(() => {
  destroyPublishOrchestration()
})

// Folder scans update both the staged-file tree and the shared status area so
// create/update flows report the same success message format.
/** Replaces staged files for a mode after its content folder has been scanned. */
function setStagedContentFilesFromFolder(mode: 'create' | 'update', contentFolder: string, files: StagedContentFile[]): void {
  setStagedFilesForMode(mode, files)
  if (files.length === 0) {
    statusMessage.value = `Content folder selected: ${contentFolder}. No files found.`
    return
  }
  const totalSize = files.reduce((sum, file) => sum + file.sizeBytes, 0)
  statusMessage.value = `Loaded ${files.length} content file(s), ${formatSizeLabel(totalSize)} total.`
}

// Keep scan failures consistent with successful folder-selection messaging.
/** Stores the folder-specific scan error shown by the selected publish mode. */
function setContentFolderSelectionError(mode: 'create' | 'update', contentFolder: string, message: string): void {
  setStagedFilesForMode(mode, [])
  statusMessage.value = `Content folder selected: ${contentFolder}. Scan failed: ${message}`
}

/** Loads Workshop items from its configured source. */
async function loadWorkshopItems(): Promise<void> {
  await workshopStore.loadWorkshopItems()
  reconcileWorkshopSelection()
}

/** Restores Workshop app ID filter to its initial state. */
async function resetWorkshopAppIdFilter(): Promise<void> {
  await workshopStore.resetAppIdFilter()
  reconcileWorkshopSelection()
}

/** Updates the current Workshop selection and hydrates its update draft when needed. */
function selectWorkshopItem(item: WorkshopItemSummary): void {
  workshopStore.selectWorkshopItem(item)
}

// Create and update use the same picker/scan flow; only the target draft changes.
/** Opens a picker so the user can select content folder for mode. */
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

/** Opens selected Workshop item and updates related UI state. */
async function openSelectedWorkshopItem(): Promise<void> {
  await workshopStore.openSelectedWorkshopItem()
}

/** Reloads the active Workshop page and reconciles the selected item. */
async function refreshSelectedWorkshopItem(): Promise<void> {
  await workshopStore.refreshSelectedWorkshopItem()
  reconcileWorkshopSelection()
}

/** Opens a picker so the user can select preview file for mode. */
async function pickPreviewFileForMode(mode: 'create' | 'update'): Promise<void> {
  try {
    const path = await window.workshop.pickFile()
    if (path) getDraftForMode(mode).previewFile = path
  } catch (error) {
    const parsed = normalizeError(error)
    statusMessage.value = `Preview selection failed: ${parsed.message}`
    showToast({ tone: 'error', title: 'Invalid Preview Image', detail: parsed.message })
  }
}

/** Opens a picker so the user can select create preview file. */
async function pickCreatePreviewFile(): Promise<void> {
  await pickPreviewFileForMode('create')
}

/** Opens a picker so the user can select create content folder. */
async function pickCreateContentFolder(): Promise<void> {
  await pickContentFolderForMode('create')
}

/** Opens a picker so the user can select update content folder. */
async function pickUpdateContentFolder(): Promise<void> {
  await pickContentFolderForMode('update')
}

/** Removes the create draft's content folder and staged files. */
function clearCreateWorkspace(): void {
  clearWorkspaceForMode('create')
  statusMessage.value = 'Mod content cleared.'
}

/** Removes the update draft's content folder and staged files. */
function clearUpdateWorkspace(): void {
  clearWorkspaceForMode('update')
  statusMessage.value = 'Mod content cleared.'
}

/** Opens settings stage and updates related UI state. */
async function openSettingsStage(): Promise<void> {
  await loadAdvancedSettings()
  setFlowStep('settings')
}

/** Opens a picker so the user can select update preview file. */
async function pickUpdatePreviewFile(): Promise<void> {
  await pickPreviewFileForMode('update')
}
</script>

<template>
  <!-- Root shell branches by lifecycle state: startup bootstrap, signed-out auth, or the authenticated workspace. -->
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
        :status-message="statusMessage"
        :login-header-status-message="loginHeaderStatusMessage"
        :app-version="appVersion"
        :is-login-submitting="isLoginSubmitting"
        :login-form="loginForm"
        :is-password-peek="isPasswordPeek"
        :auth-issue="authIssue"
        :steam-guard-prompt-type="steamGuardPromptType"
        :preferred-auth-mode="preferredAuthMode"
        :active-challenge-mode="activeChallengeMode"
        :steam-guard-code="steamGuardCode"
        :is-stored-session-login-attempt="isStoredSessionLoginAttempt"
        :can-clear-stored-session="hasPersistedStoredSession"
        :can-use-stored-session-for-login="canUseStoredSessionForLogin() && loginForm.rememberAuth"
        :is-advanced-options-open="isAdvancedOptionsOpen"
        :advanced-settings="advancedSettings"
        :is-web-api-key-peek="isWebApiKeyPeek"
        :install-log-path="installLogPath"
        timeout-scope="login_only"
        @submit-login="login"
        @update-username="setLoginUsername"
        @update-password="setLoginPassword"
        @update-remember-username="setRememberUsername"
        @update-remember-auth="setRememberAuth"
        @update-preferred-auth-mode="setPreferredAuthMode"
        @set-password-peek="setPasswordPeek"
        @submit-guard-code="submitSteamGuardCode"
        @update-steam-guard-code="setSteamGuardCode"
        @toggle-advanced-options="toggleAdvancedOptions"
        @update-web-api-key="setWebApiKey"
        @update-steamcmd-manual-path="setSteamCmdManualPath"
        @update-login-timeout-ms="setLoginTimeoutMs"
        @update-stored-session-timeout-ms="setStoredSessionTimeoutMs"
        @update-workshop-timeout-ms="setWorkshopTimeoutMs"
        @pick-steamcmd-manual-path="pickSteamCmdManualPath"
        @set-web-api-key-peek="setWebApiKeyPeek"
        @save-advanced-settings="saveAdvancedSettings"
        @clear-web-api-key="clearSavedWebApiKey"
        @open-install-log="openInstallLog"
        @clear-stored-session="clearStoredSession"
        @quit-app="quitApp"
      />
      <div v-if="showRunLogs" class="app-shell pb-6">
        <LogsSection
          :run-logs="runLogs"
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
          class="pointer-events-none fixed left-1/2 top-4 z-70 w-85 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border px-4 py-3 text-center shadow-2xl backdrop-blur-sm"
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
          @open-settings="openSettingsStage"
          @open-about="openAboutModal"
          @toggle-fullscreen="toggleFullscreen"
          @sign-out="signOut"
        />

        <section
          v-if="statusMessage"
          class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2c4b63] bg-[#132536] px-4 py-3 text-sm text-slate-200"
          role="status"
          aria-live="polite"
        >
          <p>{{ statusMessage }}</p>
          <button
            class="steam-btn-muted rounded px-3 py-2 text-xs font-semibold"
            @click="showRunLogs ? closeRunLogs() : openRunLogs()"
          >
            {{ showRunLogs ? 'Hide SteamCMD Log' : 'View SteamCMD Log' }}
          </button>
        </section>

        <LogsSection
          v-if="showRunLogs"
          :run-logs="runLogs"
          :selected-run-id="selectedRunId"
          :selected-run="selectedRun"
          :format-run-timestamp="formatRunTimestamp"
          :status-badge-class="statusBadgeClass"
          @refresh="refreshRunLogs"
          @select-run="selectRun"
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
          :is-loading="workshopStore.isLoadingWorkshopItems.value"
          :workshop-items="paginatedWorkshopItems"
          :all-items-count="workshopItemsTotalCount"
          :current-page="workshopItemsPage"
          :total-pages="workshopItemsTotalPages"
          :page-start="workshopItemsPageStart"
          :page-end="workshopItemsPageEnd"
          :visibility-filter="workshopVisibilityFilter"
          :selected-workshop-item-id="selectedWorkshopItemId"
          :empty-state-message="workshopItemsEmptyStateMessage"
          :show-empty-state="shouldShowWorkshopItemsEmptyState"
          @change-app-id="onChangeAppId"
          @change-visibility-filter="onChangeWorkshopVisibilityFilter"
          @change-page="goToWorkshopItemsPage"
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
          @toggle-content-file="toggleStagedFileForMode('update', $event)"
          @pick-preview-file="pickUpdatePreviewFile"
          @clear-preview-file="clearUpdatePreviewFile"
          @update-title="setDraftField('update', 'title', $event)"
          @update-release-notes="setDraftField('update', 'releaseNotes', $event)"
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
          @toggle-content-file="toggleStagedFileForMode('create', $event)"
          @pick-preview-file="pickCreatePreviewFile"
          @clear-preview-file="clearCreatePreviewFile"
          @update-app-id="setDraftField('create', 'appId', $event)"
          @update-title="setDraftField('create', 'title', $event)"
          @update-release-notes="setDraftField('create', 'releaseNotes', $event)"
          @change-visibility-selection="setCreateVisibility"
          @upload="openCreateConfirmation"
        />

        <SettingsSection
          v-if="flowStep === 'settings'"
          :advanced-settings="advancedSettings"
          :is-web-api-key-peek="isWebApiKeyPeek"
          @go-to-mods="goToStep('mods')"
          @update-web-api-key="setWebApiKey"
          @update-steamcmd-manual-path="setSteamCmdManualPath"
          @update-login-timeout-ms="setLoginTimeoutMs"
          @update-stored-session-timeout-ms="setStoredSessionTimeoutMs"
          @update-workshop-timeout-ms="setWorkshopTimeoutMs"
          @pick-steamcmd-manual-path="pickSteamCmdManualPath"
          @set-web-api-key-peek="setWebApiKeyPeek"
          @save-advanced-settings="saveAdvancedSettings"
          @clear-web-api-key="clearSavedWebApiKey"
        />

        <ActionConfirmDialog
          :open="isUpdateConfirmOpen"
          kicker="Confirm Update"
          title="Update Workshop Item?"
          :subject="selectedWorkshopItem?.title || updateDraft.title || 'Selected item'"
          description="This will push your current draft metadata/content to Steam Workshop."
          confirm-label="Update Item"
          @close="closeUpdateConfirmation"
          @confirm="confirmUpdateItem"
        />

        <ActionConfirmDialog
          :open="isCreateConfirmOpen"
          kicker="Confirm Create"
          title="Create Workshop Item?"
          :subject="createDraft.title || 'New item'"
          description="This will upload a new workshop item with your current create draft settings."
          confirm-label="Create Item"
          @close="closeCreateConfirmation"
          @confirm="confirmCreateItem"
        />

        <AboutDialog :open="isAboutOpen" :app-version="appVersion" @close="closeAboutModal" />
      </div>
    </template>
  </main>
</template>
