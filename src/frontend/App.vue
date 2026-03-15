<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { ContentFolderFileEntry, RunEvent, UploadDraft, WorkshopItemSummary } from '@shared/contracts'
import { evaluateCreateRequirements, evaluateUpdateRequirements } from '@shared/workshop-requirements'
import AppTopBar from './components/AppTopBar.vue'
import LoginSection from './components/LoginSection.vue'
import PublishSection from './components/PublishSection.vue'
import WorkshopItemsSection from './components/WorkshopItemsSection.vue'
import { createAppGlobalKeyDownHandler, createAppGlobalMouseDownHandler } from './events/keyboard-events'
import './styles/themes/app.theme.css'
import { formatSizeLabel } from './utils/size-format'
import type {
  AdvancedSettingsState,
  AuthIssue,
  ContentTreeNode,
  FlowStep,
  LoginFormState,
  PublishChecklistItem,
  StagedContentFile,
  SteamGuardPromptType,
  UploadDraftState,
  WorkshopVisibilityFilter
} from './types/ui'

interface ApiFailure {
  message: string
  code: string
}

interface UiToast {
  id: number
  tone: 'success' | 'error' | 'warning' | 'info'
  title: string
  detail: string
}

type UiToastInput = Omit<UiToast, 'id'> & { durationMs?: number }

const loginState = ref<'signed_out' | 'signed_in'>('signed_out')
const steamGuardSessionId = ref<string | null>(null)
const steamGuardCode = ref('')
const isPasswordPeek = ref(false)
const isWebApiKeyPeek = ref(false)
const steamGuardPromptType = ref<SteamGuardPromptType>('none')
const isStoredSessionLoginAttempt = ref(false)
const hasPersistedStoredSession = ref(false)
const isLoginSubmitting = ref(false)
const statusMessage = ref<string>('')
const authIssue = ref<AuthIssue | null>(null)
const flowStep = ref<FlowStep>('mods')
const isSteamCmdDetected = ref(false)
const isAdvancedOptionsOpen = ref(false)

const loginForm = reactive<LoginFormState>({
  username: '',
  password: '',
  rememberUsername: true,
  rememberAuth: false
})

const advancedSettings = reactive<AdvancedSettingsState>({
  webApiEnabled: false,
  webApiKey: '',
  hasWebApiKey: false,
  secureStorageAvailable: true,
  isSaving: false,
  statusMessage: ''
})

function createEmptyDraft(): UploadDraftState {
  return {
    appId: '',
    publishedFileId: '',
    contentFolder: '',
    previewFile: '',
    title: '',
    releaseNotes: '',
    tags: []
  }
}

function cloneDraft(source: UploadDraftState): UploadDraftState {
  return {
    appId: source.appId,
    publishedFileId: source.publishedFileId,
    contentFolder: source.contentFolder,
    previewFile: source.previewFile,
    title: source.title,
    releaseNotes: source.releaseNotes,
    tags: [...source.tags]
  }
}

function applyDraft(target: UploadDraftState, source: UploadDraftState): void {
  target.appId = source.appId
  target.publishedFileId = source.publishedFileId
  target.contentFolder = source.contentFolder
  target.previewFile = source.previewFile
  target.title = source.title
  target.releaseNotes = source.releaseNotes
  target.tags = [...source.tags]
}

const createDraft = reactive<UploadDraftState>(createEmptyDraft())
const updateDraft = reactive<UploadDraftState>(createEmptyDraft())
const updateDraftCache = ref<Record<string, UploadDraftState>>({})
const isHydratingUpdateDraft = ref(false)
const workshopFilterAppId = ref('')
const workshopVisibilityFilter = ref<WorkshopVisibilityFilter>('all')
const updateTagInput = ref('')
const createTagInput = ref('')
const workshopItems = ref<WorkshopItemSummary[]>([])
const selectedWorkshopItemId = ref<string>('')
const committedVisibility = ref<0 | 1 | 2 | 3>(0)
const pendingVisibility = ref<0 | 1 | 2 | 3>(0)

const stagedContentFiles = ref<StagedContentFile[]>([])
const isFullscreen = ref(false)
const isAboutOpen = ref(false)
const isBootstrapping = ref(true)
const activeToast = ref<UiToast | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const selectedWorkshopItem = computed(() => workshopItems.value.find((item) => item.publishedFileId === selectedWorkshopItemId.value))
const totalStagedContentSizeBytes = computed(() =>
  stagedContentFiles.value.reduce((sum, file) => sum + file.sizeBytes, 0)
)
const filteredWorkshopItems = computed(() => {
  if (workshopVisibilityFilter.value === 'all') {
    return workshopItems.value
  }

  return workshopItems.value.filter((item) => {
    if (workshopVisibilityFilter.value === 'public') {
      return item.visibility === 0
    }
    if (workshopVisibilityFilter.value === 'friends') {
      return item.visibility === 1
    }
    if (workshopVisibilityFilter.value === 'hidden') {
      return item.visibility === 2
    }
    if (workshopVisibilityFilter.value === 'unlisted') {
      return item.visibility === 3
    }
    return typeof item.visibility === 'undefined'
  })
})
const isAuthenticated = computed(() => loginState.value === 'signed_in')
const canAccessMods = computed(() => loginState.value === 'signed_in')
const canAccessUpdate = computed(() => canAccessMods.value && selectedWorkshopItemId.value.trim().length > 0)
const selectedUpdateAppId = computed(() => {
  const fromItem = selectedWorkshopItem.value?.appId?.trim()
  if (fromItem) {
    return fromItem
  }
  return updateDraft.appId.trim()
})
const canChangeVisibility = computed(() => {
  return (
    loginState.value === 'signed_in' &&
    selectedWorkshopItemId.value.trim().length > 0 &&
    selectedUpdateAppId.value.length > 0 &&
    pendingVisibility.value !== committedVisibility.value
  )
})
const activePublishMode = computed<'update' | 'create'>(() => (flowStep.value === 'create' ? 'create' : 'update'))
const activeDraft = computed<UploadDraftState>(() => (activePublishMode.value === 'create' ? createDraft : updateDraft))
const activeTagInput = computed<string>(() => (activePublishMode.value === 'create' ? createTagInput.value : updateTagInput.value))
const accountPersonaName = ref<string>('')
const accountDisplayName = computed(() => accountPersonaName.value || loginForm.username.trim() || 'Steam account')
const accountProfileImageUrl = ref<string | null>(null)
const loginHeaderStatusMessage = computed(() => (isSteamCmdDetected.value ? 'SteamCMD found ✓' : ''))
const createRequirements = computed(() => evaluateCreateRequirements(createDraft))
const updateRequirements = computed(() => evaluateUpdateRequirements(updateDraft))

const updateChecklist = computed<PublishChecklistItem[]>(() => {
  return [
    { label: 'App ID', ok: updateRequirements.value.appId },
    { label: 'Published File ID', ok: updateRequirements.value.publishedFileId },
    { label: 'Title', ok: updateDraft.title.trim().length > 0 },
    { label: 'Content folder or Thumbnail', ok: updateRequirements.value.contentOrPreview },
    { label: 'Release notes', ok: updateDraft.releaseNotes.trim().length > 0, optional: true }
  ]
})

const createChecklist = computed<PublishChecklistItem[]>(() => {
  return [
    { label: 'App ID', ok: createRequirements.value.appId },
    { label: 'Content folder', ok: createRequirements.value.contentFolder },
    { label: 'Title', ok: createRequirements.value.title },
    { label: 'Preview image', ok: createDraft.previewFile.trim().length > 0, optional: true },
    { label: 'Release notes', ok: createDraft.releaseNotes.trim().length > 0, optional: true }
  ]
})

const activePublishChecklist = computed<PublishChecklistItem[]>(() =>
  activePublishMode.value === 'create' ? createChecklist.value : updateChecklist.value
)

const stagedContentTree = computed<ContentTreeNode[]>(() => buildContentTree(stagedContentFiles.value))

function normalizeError(error: unknown): ApiFailure {
  const fallback: ApiFailure = {
    message: 'Unexpected error',
    code: 'command_failed'
  }

  if (!error) {
    return fallback
  }

  const extract = (input: string): ApiFailure => {
    const withoutIpcPrefix = input.replace(/^Error invoking remote method '[^']+':\s*/i, '').trim()
    const normalized = withoutIpcPrefix.replace(/^Error:\s*/i, '').trim()
    const coded = normalized.match(/^\[(validation|install|auth|steam_guard|command_failed|timeout)\]\s*(.*)$/i)
    if (coded) {
      return {
        code: coded[1].toLowerCase(),
        message: coded[2].trim() || fallback.message
      }
    }
    return {
      code: fallback.code,
      message: normalized || fallback.message
    }
  }

  if (error instanceof Error) {
    return extract(error.message)
  }

  if (typeof error === 'string') {
    return extract(error)
  }

  if (typeof error !== 'object') {
    return fallback
  }

  const maybe = error as Partial<ApiFailure> & { cause?: unknown }
  if (maybe.cause && typeof maybe.cause === 'object') {
    const nested = maybe.cause as Partial<ApiFailure>
    if (typeof nested.message === 'string' && typeof nested.code === 'string') {
      return { message: nested.message, code: nested.code }
    }
  }

  return {
    message: maybe.message ?? fallback.message,
    code: maybe.code ?? fallback.code
  }
}

function toAuthIssue(error: ApiFailure): AuthIssue {
  const message = error.message.toLowerCase()

  if (
    /username or password|invalidpassword|incorrect password|invalid password|account name or password/.test(message)
  ) {
    return {
      title: 'Wrong Credentials',
      detail: 'Wrong username or password. Try again.',
      hint: 'Check account name and password, then sign in again.',
      tone: 'danger'
    }
  }

  if (
    error.code === 'steam_guard' &&
    /invalid|expired|incorrect/.test(message)
  ) {
    return {
      title: 'Invalid Steam Guard Code',
      detail: 'The entered Steam Guard code is invalid or expired.',
      hint: 'Use a fresh code from Steam and submit again.',
      tone: 'danger'
    }
  }

  if (
    error.code === 'steam_guard' &&
    /timed out|timeout|confirmation/.test(message)
  ) {
    return {
      title: 'Steam Guard Confirmation Timed Out',
      detail: 'Steam did not receive confirmation in time.',
      hint: 'Approve the login immediately in the Steam mobile app, then retry.',
      tone: 'warning'
    }
  }

  if (/too many|rate limit|try again later|temporarily blocked|captcha/.test(message)) {
    return {
      title: 'Too Many Login Attempts',
      detail: 'Steam temporarily blocked login attempts.',
      hint: 'Wait a few minutes before retrying.',
      tone: 'warning'
    }
  }

  if (/network|service|failed to connect|unable to connect|no connection/.test(message)) {
    return {
      title: 'Steam Connection Issue',
      detail: 'Steam services or network connection failed during login.',
      hint: 'Check internet connection and retry.',
      tone: 'warning'
    }
  }

  if (error.code === 'steam_guard') {
    return {
      title: 'Steam Guard Required',
      detail: error.message,
      hint: 'Complete the Steam Guard step and retry if needed.',
      tone: 'info'
    }
  }

  return {
    title: 'Login Failed',
    detail: error.message,
    hint: 'Review the message and try again.',
    tone: 'danger'
  }
}

function isSavedSessionFallbackError(error: ApiFailure): boolean {
  return error.code === 'auth' || error.code === 'timeout' || error.code === 'command_failed'
}

function canUseStoredSessionForLogin(): boolean {
  return loginForm.rememberAuth && hasPersistedStoredSession.value
}

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

  if (
    (step === 'update' || step === 'create') &&
    (flowStep.value === 'update' || flowStep.value === 'create') &&
    flowStep.value !== step
  ) {
    const fromDraft = flowStep.value === 'create' ? createDraft : updateDraft
    const toDraft = step === 'create' ? createDraft : updateDraft
    const fromContentFolder = fromDraft.contentFolder.trim()
    if (!toDraft.contentFolder.trim() && fromContentFolder.length > 0) {
      toDraft.contentFolder = fromContentFolder
    }
  }

  flowStep.value = step
}

function fileNameFromPath(path: string): string {
  const segments = path.split(/[/\\]/)
  return segments[segments.length - 1] || path
}

function normalizeFsPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

function dedupeContentFiles(files: StagedContentFile[]): StagedContentFile[] {
  const byPath = new Map<string, StagedContentFile>()
  for (const file of files) {
    byPath.set(normalizeFsPath(file.absolutePath), file)
  }
  return [...byPath.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' }))
}

function mergeContentFiles(existing: StagedContentFile[], incoming: StagedContentFile[]): StagedContentFile[] {
  return dedupeContentFiles([...existing, ...incoming])
}

function isPathInContentFolder(filePath: string, contentFolder: string): boolean {
  const normalizedFile = normalizeFsPath(filePath)
  const normalizedFolder = normalizeFsPath(contentFolder)
  if (!normalizedFolder) {
    return false
  }
  return normalizedFile === normalizedFolder || normalizedFile.startsWith(`${normalizedFolder}/`)
}

function toStagedContentFile(entry: ContentFolderFileEntry): StagedContentFile {
  return {
    absolutePath: entry.absolutePath,
    relativePath: normalizeRelativePath(entry.relativePath),
    sizeBytes: entry.sizeBytes
  }
}

async function loadContentFolderFiles(contentFolder: string): Promise<StagedContentFile[]> {
  const payload = await window.workshop.listContentFolderFiles({ folderPath: contentFolder })
  return dedupeContentFiles(payload.map(toStagedContentFile))
}

function buildContentTree(files: StagedContentFile[]): ContentTreeNode[] {
  interface MutableFileNode {
    id: string
    name: string
    type: 'file'
    relativePath: string
    absolutePath: string
    sizeBytes: number
    fileCount: number
  }

  interface MutableFolderNode {
    id: string
    name: string
    type: 'folder'
    relativePath: string
    children: Map<string, MutableNode>
  }

  type MutableNode = MutableFolderNode | MutableFileNode

  const root: MutableFolderNode = {
    id: '__root__',
    name: '',
    type: 'folder',
    relativePath: '',
    children: new Map()
  }

  for (const file of files) {
    const parts = file.relativePath.split('/').filter((part) => part.length > 0)
    if (parts.length === 0) {
      continue
    }

    let currentFolder = root
    let currentRelativePath = ''
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      const isLeafFile = index === parts.length - 1
      currentRelativePath = currentRelativePath ? `${currentRelativePath}/${part}` : part

      if (isLeafFile) {
        currentFolder.children.set(part, {
          id: `file:${currentRelativePath}`,
          name: part,
          type: 'file',
          relativePath: currentRelativePath,
          absolutePath: file.absolutePath,
          sizeBytes: file.sizeBytes,
          fileCount: 1
        })
        continue
      }

      const existing = currentFolder.children.get(part)
      if (existing?.type === 'folder') {
        currentFolder = existing
        continue
      }

      const folder: MutableFolderNode = {
        id: `folder:${currentRelativePath}`,
        name: part,
        type: 'folder',
        relativePath: currentRelativePath,
        children: new Map()
      }
      currentFolder.children.set(part, folder)
      currentFolder = folder
    }
  }

  const finalizeNode = (node: MutableNode): ContentTreeNode => {
    if (node.type === 'file') {
      return node
    }

    const children = [...node.children.values()]
      .map(finalizeNode)
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === 'folder' ? -1 : 1
        }
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      })

    return {
      id: node.id,
      name: node.name,
      type: 'folder',
      relativePath: node.relativePath,
      sizeBytes: children.reduce((sum, child) => sum + child.sizeBytes, 0),
      fileCount: children.reduce((sum, child) => sum + child.fileCount, 0),
      children
    }
  }

  const tree = finalizeNode(root)
  return tree.children ?? []
}

async function stageSelectedContentFiles(paths: string[]): Promise<void> {
  const contentFolder = activeDraft.value.contentFolder.trim()
  if (contentFolder.length === 0) {
    statusMessage.value = 'Select content folder first.'
    return
  }

  const normalizedSelected = [...new Set(paths.filter((path) => path.trim().length > 0))]
  if (normalizedSelected.length === 0) {
    return
  }

  const filesInFolder = await loadContentFolderFiles(contentFolder)
  const fileByAbsolutePath = new Map(filesInFolder.map((file) => [normalizeFsPath(file.absolutePath), file]))
  const selectedMatches: StagedContentFile[] = []
  let outsideCount = 0

  for (const path of normalizedSelected) {
    if (!isPathInContentFolder(path, contentFolder)) {
      outsideCount += 1
      continue
    }

    const match = fileByAbsolutePath.get(normalizeFsPath(path))
    if (!match) {
      outsideCount += 1
      continue
    }
    selectedMatches.push(match)
  }

  if (selectedMatches.length === 0) {
    statusMessage.value = 'No files were added. Pick files inside the selected content folder.'
    return
  }

  const beforeCount = stagedContentFiles.value.length
  stagedContentFiles.value = mergeContentFiles(stagedContentFiles.value, selectedMatches)
  const addedCount = stagedContentFiles.value.length - beforeCount
  const addedSize = selectedMatches.reduce((sum, file) => sum + file.sizeBytes, 0)

  if (outsideCount > 0) {
    statusMessage.value = `Added ${addedCount} file(s) (${formatSizeLabel(addedSize)}). Skipped ${outsideCount} path(s) outside content folder.`
    return
  }

  statusMessage.value = `Added ${addedCount} file(s) (${formatSizeLabel(addedSize)}).`
}

function removeStagedFile(absolutePath: string): void {
  const pathKey = normalizeFsPath(absolutePath)
  stagedContentFiles.value = stagedContentFiles.value.filter((item) => normalizeFsPath(item.absolutePath) !== pathKey)
  const removedName = fileNameFromPath(absolutePath)
  statusMessage.value = `Removed staged file: ${removedName}`
}

async function pickUploadFiles(): Promise<void> {
  if (activeDraft.value.contentFolder.trim().length === 0) {
    statusMessage.value = 'Select content folder first.'
    return
  }

  const paths = await window.workshop.pickFiles()
  if (!paths || paths.length === 0) {
    return
  }
  try {
    await stageSelectedContentFiles(paths)
  } catch (error) {
    const parsed = normalizeError(error)
    statusMessage.value = `Failed to add files (${parsed.code}): ${parsed.message}`
    showToast({
      tone: 'error',
      title: 'Add Files Failed',
      detail: parsed.message
    })
  }
}

function clearUploadFiles(): void {
  stagedContentFiles.value = []
}

function clearWorkspace(): void {
  activeDraft.value.contentFolder = ''
  stagedContentFiles.value = []
  statusMessage.value = 'Mod content cleared.'
}

function setStagedContentFilesFromFolder(contentFolder: string, files: StagedContentFile[]): void {
  stagedContentFiles.value = files
  if (files.length === 0) {
    statusMessage.value = `Content folder selected: ${contentFolder}. No files found.`
    return
  }
  const totalSize = files.reduce((sum, file) => sum + file.sizeBytes, 0)
  statusMessage.value = `Loaded ${files.length} content file(s), ${formatSizeLabel(totalSize)} total.`
}

function setContentFolderSelectionError(contentFolder: string, message: string): void {
  stagedContentFiles.value = []
  statusMessage.value = `Content folder selected: ${contentFolder}. Scan failed: ${message}`
  showToast({
    tone: 'error',
    title: 'Content Scan Failed',
    detail: message
  })
}

function addTag(): void {
  const value = activeTagInput.value.trim()
  if (!value) {
    return
  }
  activeDraft.value.tags.push(value)
  if (activePublishMode.value === 'create') {
    createTagInput.value = ''
    return
  }
  updateTagInput.value = ''
}

function removeTag(tag: string): void {
  activeDraft.value.tags = activeDraft.value.tags.filter((value) => value !== tag)
}

function onChangeAppId(value: string): void {
  workshopFilterAppId.value = value
}

function onChangeWorkshopVisibilityFilter(value: WorkshopVisibilityFilter): void {
  workshopVisibilityFilter.value = value
}

function onChangeTagInput(value: string): void {
  if (activePublishMode.value === 'create') {
    createTagInput.value = value
    return
  }
  updateTagInput.value = value
}

function visibilityLabel(value: 0 | 1 | 2 | 3): string {
  if (value === 0) {
    return 'Public'
  }
  if (value === 1) {
    return 'Friends-only'
  }
  if (value === 2) {
    return 'Hidden'
  }
  return 'Unlisted'
}

function setPendingVisibility(value: 0 | 1 | 2 | 3): void {
  pendingVisibility.value = value
}

function setPasswordPeek(value: boolean): void {
  isPasswordPeek.value = value
}

function setWebApiKeyPeek(value: boolean): void {
  isWebApiKeyPeek.value = value
}

function setWebApiKey(value: string): void {
  advancedSettings.webApiKey = value
}

function toggleAdvancedOptions(): void {
  isAdvancedOptionsOpen.value = !isAdvancedOptionsOpen.value
}

function setSteamGuardCode(value: string): void {
  steamGuardCode.value = value
}

function syncFullscreenState(): void {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
      return
    }
    await document.exitFullscreen()
  } catch {
    statusMessage.value = 'Fullscreen toggle failed.'
  }
}

function openAboutModal(): void {
  isAboutOpen.value = true
}

function closeAboutModal(): void {
  isAboutOpen.value = false
}

function canGoBackFlow(): boolean {
  return isAuthenticated.value && flowStep.value !== 'mods'
}

function goBackFlow(): void {
  if (canGoBackFlow()) {
    goToStep('mods')
  }
}

function scrollViewport(direction: 1 | -1): void {
  const topOffset = direction * 140
  const scrollingElement = document.scrollingElement
  if (scrollingElement) {
    scrollingElement.scrollBy({ top: topOffset, behavior: 'smooth' })
    return
  }
  window.scrollBy({ top: topOffset, behavior: 'smooth' })
}

const onGlobalKeyDown = createAppGlobalKeyDownHandler({
  isAboutOpen: () => isAboutOpen.value,
  toggleFullscreen: () => {
    void toggleFullscreen()
  },
  closeAbout: closeAboutModal,
  goToStep,
  scrollViewport,
  canGoBack: canGoBackFlow,
  goBack: goBackFlow,
  isAuthenticated: () => isAuthenticated.value
})

const onGlobalMouseDown = createAppGlobalMouseDownHandler({
  canGoBack: canGoBackFlow,
  goBack: goBackFlow
})

function toastToneClass(tone: UiToast['tone']): string {
  if (tone === 'success') {
    return 'border-emerald-400/60 bg-emerald-900/85 text-emerald-100'
  }
  if (tone === 'warning') {
    return 'border-amber-300/70 bg-amber-900/85 text-amber-100'
  }
  if (tone === 'info') {
    return 'border-sky-300/70 bg-sky-900/85 text-sky-100'
  }
  return 'border-rose-400/60 bg-rose-900/85 text-rose-100'
}

function showToast(toast: UiToastInput): void {
  const durationMs = typeof toast.durationMs === 'number' && toast.durationMs > 0 ? toast.durationMs : 3800
  activeToast.value = {
    id: Date.now(),
    tone: toast.tone,
    title: toast.title,
    detail: toast.detail
  }

  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  toastTimer = setTimeout(() => {
    activeToast.value = null
    toastTimer = null
  }, durationMs)
}

type ActionOperation = 'upload' | 'update' | 'visibility'

function actionFailureTitle(operation: ActionOperation): string {
  if (operation === 'upload') {
    return 'Upload Failed'
  }
  if (operation === 'update') {
    return 'Update Failed'
  }
  return 'Visibility Update Failed'
}

function actionFailureStatus(operation: ActionOperation): string {
  if (operation === 'upload') {
    return 'Upload failed. See popup.'
  }
  if (operation === 'update') {
    return 'Update failed. See popup.'
  }
  return 'Visibility update failed. See popup.'
}

function handleActionFailure(operation: ActionOperation, error: unknown): void {
  const parsed = normalizeError(error)
  statusMessage.value = actionFailureStatus(operation)
  showToast({
    tone: 'error',
    title: actionFailureTitle(operation),
    detail: parsed.message
  })
}

function selectWorkshopItem(item: WorkshopItemSummary): void {
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

  committedVisibility.value = visibility
  pendingVisibility.value = visibility
  statusMessage.value = `Loaded workshop item: ${item.title}`
  flowStep.value = 'update'
}

function buildUploadDraft(
  source: UploadDraftState,
  mode: 'update' | 'create',
  visibility?: 0 | 1 | 2 | 3
): UploadDraft {
  return {
    appId: source.appId,
    publishedFileId: mode === 'update' ? source.publishedFileId || undefined : undefined,
    contentFolder: source.contentFolder,
    previewFile: source.previewFile,
    title: source.title,
    changenote: source.releaseNotes.trim().length > 0 ? source.releaseNotes.trim() : undefined,
    tags: [...source.tags],
    visibility
  }
}

async function ensureSteamCmdInstalled(): Promise<void> {
  isSteamCmdDetected.value = false
  statusMessage.value = 'Checking SteamCMD installation...'
  try {
    await window.workshop.ensureSteamCmdInstalled()
    isSteamCmdDetected.value = true
    statusMessage.value = 'SteamCMD is ready.'
  } catch (error) {
    const parsed = normalizeError(error)
    isSteamCmdDetected.value = false
    statusMessage.value = `Install error (${parsed.code}): ${parsed.message}`
  }
}

async function refreshRememberedLoginState(): Promise<void> {
  const payload = await window.workshop.getProfiles()
  if (payload.rememberedUsername) {
    loginForm.username = payload.rememberedUsername
  }
  const hasStoredAuth = payload.hasStoredAuth === true
  loginForm.rememberAuth = payload.rememberAuth === true && hasStoredAuth
  hasPersistedStoredSession.value = hasStoredAuth
  if (loginForm.rememberAuth) {
    loginForm.rememberUsername = true
  }
}

async function loadAdvancedSettings(): Promise<void> {
  try {
    const payload = await window.workshop.getAdvancedSettings()
    advancedSettings.webApiEnabled = payload.webApiEnabled
    advancedSettings.hasWebApiKey = payload.hasWebApiKey
    advancedSettings.secureStorageAvailable = payload.secureStorageAvailable
  } catch (error) {
    const parsed = normalizeError(error)
    advancedSettings.statusMessage = `Advanced options load failed (${parsed.code}): ${parsed.message}`
  }
}

async function saveAdvancedSettings(): Promise<void> {
  if (advancedSettings.isSaving) {
    return
  }

  try {
    advancedSettings.isSaving = true
    advancedSettings.statusMessage = ''
    const normalizedKey = advancedSettings.webApiKey.trim()
    const implicitEnable = normalizedKey.length > 0 ? true : advancedSettings.webApiEnabled
    const payload = await window.workshop.saveAdvancedSettings({
      webApiEnabled: implicitEnable,
      webApiKey: normalizedKey.length > 0 ? normalizedKey : undefined
    })
    advancedSettings.webApiEnabled = payload.webApiEnabled
    advancedSettings.hasWebApiKey = payload.hasWebApiKey
    advancedSettings.secureStorageAvailable = payload.secureStorageAvailable
    advancedSettings.webApiKey = ''
    advancedSettings.statusMessage = 'Advanced options saved.'
  } catch (error) {
    const parsed = normalizeError(error)
    advancedSettings.statusMessage = `Advanced options save failed (${parsed.code}): ${parsed.message}`
  } finally {
    advancedSettings.isSaving = false
  }
}

async function clearSavedWebApiKey(): Promise<void> {
  if (advancedSettings.isSaving) {
    return
  }

  try {
    advancedSettings.isSaving = true
    advancedSettings.statusMessage = ''
    const payload = await window.workshop.saveAdvancedSettings({
      webApiEnabled: advancedSettings.webApiEnabled,
      clearWebApiKey: true
    })
    advancedSettings.webApiEnabled = payload.webApiEnabled
    advancedSettings.hasWebApiKey = payload.hasWebApiKey
    advancedSettings.secureStorageAvailable = payload.secureStorageAvailable
    advancedSettings.webApiKey = ''
    advancedSettings.statusMessage = 'Saved Web API key removed.'
  } catch (error) {
    const parsed = normalizeError(error)
    advancedSettings.statusMessage = `Web API key removal failed (${parsed.code}): ${parsed.message}`
  } finally {
    advancedSettings.isSaving = false
  }
}

async function clearStoredSession(): Promise<void> {
  if (isLoginSubmitting.value) {
    return
  }

  try {
    await window.workshop.clearStoredSession()
    hasPersistedStoredSession.value = false
    loginForm.rememberAuth = false
    loginForm.password = ''
    isPasswordPeek.value = false
    isStoredSessionLoginAttempt.value = false
    steamGuardSessionId.value = null
    steamGuardCode.value = ''
    steamGuardPromptType.value = 'none'
    authIssue.value = null
    statusMessage.value = 'Saved session cleared. Enter password to sign in.'
  } catch (error) {
    const parsed = normalizeError(error)
    statusMessage.value = `Clear session failed (${parsed.code}): ${parsed.message}`
  }
}

async function finalizeSuccessfulLogin(successMessage: string): Promise<void> {
  loginState.value = 'signed_in'
  steamGuardSessionId.value = null
  steamGuardPromptType.value = 'none'
  authIssue.value = null
  statusMessage.value = successMessage
  loginForm.password = ''
  hasPersistedStoredSession.value = loginForm.rememberAuth
  flowStep.value = 'mods'
  await Promise.all([loadWorkshopItems(), refreshCurrentProfile()])
}

async function tryAutoLoginWithStoredSession(): Promise<void> {
  if (!canUseStoredSessionForLogin() || loginForm.username.trim().length === 0) {
    return
  }

  if (isLoginSubmitting.value) {
    return
  }

  try {
    authIssue.value = null
    isLoginSubmitting.value = true
    isPasswordPeek.value = false
    steamGuardSessionId.value = null
    steamGuardCode.value = ''
    steamGuardPromptType.value = 'waiting'
    statusMessage.value = 'Restoring saved Steam session...'
    await window.workshop.login({
      username: loginForm.username,
      password: '',
      rememberUsername: true,
      rememberAuth: true,
      useStoredAuth: true
    })
    await finalizeSuccessfulLogin('Signed in with saved Steam session. Loading workshop items...')
  } catch (error) {
    const parsed = normalizeError(error)
    if (isSavedSessionFallbackError(parsed)) {
      steamGuardPromptType.value = 'none'
      steamGuardSessionId.value = null
      authIssue.value = null
      statusMessage.value = 'Saved session expired. Enter password to sign in again.'
      return
    }
    statusMessage.value = `Auto sign-in failed (${parsed.code}): ${parsed.message}`
    authIssue.value = toAuthIssue(parsed)
  } finally {
    isLoginSubmitting.value = false
  }
}

async function refreshCurrentProfile(): Promise<void> {
  try {
    const profile = await window.workshop.getCurrentProfile()
    accountPersonaName.value = profile.personaName?.trim() || ''
    accountProfileImageUrl.value = profile.avatarUrl?.trim() || null
  } catch {
    accountPersonaName.value = ''
    accountProfileImageUrl.value = null
  }
}

async function loadWorkshopItems(): Promise<void> {
  if (!canAccessMods.value) {
    statusMessage.value = 'Login first to load workshop items.'
    return
  }

  try {
    const items = await window.workshop.getMyWorkshopItems({ appId: workshopFilterAppId.value || undefined })
    workshopItems.value = items
    if (items.length === 0) {
      statusMessage.value = 'No workshop items found for this account/filter.'
      return
    }
    statusMessage.value = `Loaded ${items.length} workshop item(s).`
  } catch (error) {
    const parsed = normalizeError(error)
    statusMessage.value = `Workshop list failed (${parsed.code}): ${parsed.message}`
  }
}

async function resetAppIdFilter(): Promise<void> {
  if (workshopFilterAppId.value.trim().length === 0) {
    return
  }

  workshopFilterAppId.value = ''
  if (canAccessMods.value) {
    await loadWorkshopItems()
    return
  }
  statusMessage.value = 'App ID filter cleared.'
}

async function login(): Promise<void> {
  if (isLoginSubmitting.value) {
    return
  }

  const hasUsername = loginForm.username.trim().length > 0
  const hasPassword = loginForm.password.trim().length > 0
  const usingSavedSession = canUseStoredSessionForLogin() && !hasPassword

  if (!hasUsername) {
    statusMessage.value = 'Enter your Steam account name.'
    return
  }

  if (!hasPassword && !usingSavedSession) {
    statusMessage.value = 'Enter your password to sign in.'
    return
  }

  try {
    const rememberAuth = loginForm.rememberAuth
    const rememberUsername = loginForm.rememberUsername || rememberAuth
    loginForm.rememberUsername = rememberUsername
    isStoredSessionLoginAttempt.value = usingSavedSession
    authIssue.value = null
    isLoginSubmitting.value = true
    isPasswordPeek.value = false
    steamGuardSessionId.value = null
    steamGuardCode.value = ''
    steamGuardPromptType.value = 'waiting'
    statusMessage.value = usingSavedSession
      ? 'Signing in with saved Steam session...'
      : 'Signing in to Steam... If you use Steam Guard Mobile, approve on your phone now.'
    await window.workshop.login({
      username: loginForm.username,
      password: usingSavedSession ? '' : loginForm.password,
      rememberUsername,
      rememberAuth,
      useStoredAuth: usingSavedSession
    })
    await finalizeSuccessfulLogin(
      usingSavedSession
        ? 'Saved Steam session restored. Loading workshop items...'
        : 'Steam login successful. Loading workshop items...'
    )
  } catch (error) {
    const parsed = normalizeError(error)
    steamGuardPromptType.value = 'none'
    steamGuardSessionId.value = null
    if (isSavedSessionFallbackError(parsed) && usingSavedSession) {
      statusMessage.value = 'Saved session unavailable. Enter password to sign in again.'
      authIssue.value = null
      return
    }
    statusMessage.value = `Login failed (${parsed.code}): ${parsed.message}`
    authIssue.value = toAuthIssue(parsed)
  } finally {
    isStoredSessionLoginAttempt.value = false
    isLoginSubmitting.value = false
  }
}

async function signOut(): Promise<void> {
  try {
    await window.workshop.logout()
  } catch {
    // keep local sign out even if backend IPC fails
  }

  loginState.value = 'signed_out'
  steamGuardSessionId.value = null
  steamGuardCode.value = ''
  steamGuardPromptType.value = 'none'
  selectedWorkshopItemId.value = ''
  committedVisibility.value = 0
  pendingVisibility.value = 0
  workshopItems.value = []
  workshopFilterAppId.value = ''
  workshopVisibilityFilter.value = 'all'
  applyDraft(createDraft, createEmptyDraft())
  applyDraft(updateDraft, createEmptyDraft())
  updateDraftCache.value = {}
  createTagInput.value = ''
  updateTagInput.value = ''
  flowStep.value = 'mods'
  statusMessage.value = 'Signed out.'
  accountPersonaName.value = ''
  accountProfileImageUrl.value = null
}

async function submitSteamGuardCode(): Promise<void> {
  if (
    steamGuardPromptType.value !== 'steam_guard_code' ||
    !steamGuardSessionId.value ||
    steamGuardCode.value.trim().length === 0
  ) {
    return
  }

  try {
    authIssue.value = null
    await window.workshop.submitSteamGuardCode({
      sessionId: steamGuardSessionId.value,
      code: steamGuardCode.value
    })
    statusMessage.value = 'Steam Guard code submitted. Waiting for SteamCMD...'
    steamGuardCode.value = ''
  } catch (error) {
    const parsed = normalizeError(error)
    statusMessage.value = `Steam Guard failed (${parsed.code}): ${parsed.message}`
    authIssue.value = toAuthIssue(parsed)
  }
}

async function pickContentFolder(): Promise<void> {
  const path = await window.workshop.pickFolder()
  if (path) {
    activeDraft.value.contentFolder = path
    try {
      const files = await loadContentFolderFiles(path)
      setStagedContentFilesFromFolder(path, files)
    } catch (error) {
      const parsed = normalizeError(error)
      setContentFolderSelectionError(path, parsed.message)
    }
  }
}

async function openCurrentContentFolder(): Promise<void> {
  const folderPath = activeDraft.value.contentFolder.trim()
  if (!folderPath) {
    statusMessage.value = 'Select content folder first.'
    return
  }

  try {
    const result = await window.workshop.openPath({ path: folderPath })
    if (result.error) {
      statusMessage.value = `Could not open folder: ${result.error}`
    }
  } catch (error) {
    const parsed = normalizeError(error)
    statusMessage.value = `Open folder failed (${parsed.code}): ${parsed.message}`
  }
}

async function openSelectedWorkshopItem(): Promise<void> {
  const publishedFileId = selectedWorkshopItemId.value.trim()
  if (!publishedFileId) {
    statusMessage.value = 'Select a workshop item first.'
    return
  }

  const workshopUrl = `https://steamcommunity.com/sharedfiles/filedetails/?id=${encodeURIComponent(publishedFileId)}`
  try {
    const result = await window.workshop.openExternal({ url: workshopUrl })
    if (result.error) {
      statusMessage.value = `Could not open workshop page: ${result.error}`
      return
    }
    statusMessage.value = 'Opened workshop page in your browser.'
  } catch (error) {
    const parsed = normalizeError(error)
    statusMessage.value = `Open workshop page failed (${parsed.code}): ${parsed.message}`
  }
}

async function pickPreviewFile(): Promise<void> {
  const path = await window.workshop.pickFile()
  if (path) {
    activeDraft.value.previewFile = path
  }
}

function clearPreviewFile(): void {
  activeDraft.value.previewFile = ''
}

function canCreate(): boolean {
  return loginState.value === 'signed_in' && createRequirements.value.valid
}

function canUpdate(): boolean {
  return (
    loginState.value === 'signed_in' &&
    selectedWorkshopItemId.value.trim().length > 0 &&
    updateRequirements.value.valid
  )
}

async function upload(): Promise<void> {
  if (!canCreate()) {
    statusMessage.value = 'Upload blocked: complete required fields and login first.'
    return
  }

  try {
    const result = (await window.workshop.uploadMod({
      profileId: 'new-item',
      draft: buildUploadDraft(createDraft, 'create')
    })) as { publishedFileId?: string }

    statusMessage.value = 'Upload completed successfully.'
    showToast({
      tone: 'success',
      title: 'Upload Completed',
      detail: result.publishedFileId
        ? `Published File ID: ${result.publishedFileId}`
        : 'Workshop item upload finished successfully.'
    })
  } catch (error) {
    handleActionFailure('upload', error)
  }
}

async function updateItem(): Promise<void> {
  if (!canUpdate()) {
    statusMessage.value = 'Update blocked: add content folder or preview image first.'
    return
  }

  try {
    const result = (await window.workshop.updateMod({
      profileId: selectedWorkshopItemId.value || updateDraft.publishedFileId,
      draft: buildUploadDraft(updateDraft, 'update', pendingVisibility.value)
    })) as { publishedFileId?: string }

    committedVisibility.value = pendingVisibility.value
    workshopItems.value = workshopItems.value.map((item) =>
      item.publishedFileId === selectedWorkshopItemId.value
        ? { ...item, visibility: committedVisibility.value }
        : item
    )
    statusMessage.value = 'Update completed successfully.'
    showToast({
      tone: 'success',
      title: 'Update Completed',
      detail: result.publishedFileId
        ? `Updated item ID: ${result.publishedFileId}`
        : 'Workshop item update finished successfully.'
    })
    delete updateDraftCache.value[selectedWorkshopItemId.value]
  } catch (error) {
    handleActionFailure('update', error)
  }
}

async function updateVisibilityOnly(): Promise<void> {
  if (!canChangeVisibility.value) {
    statusMessage.value = 'Select a different visibility first.'
    return
  }

  const appId = selectedUpdateAppId.value
  const publishedFileId = selectedWorkshopItemId.value.trim()
  const targetVisibility = pendingVisibility.value

  try {
    const result = await window.workshop.updateVisibility({
      appId,
      publishedFileId,
      visibility: targetVisibility
    })

    committedVisibility.value = targetVisibility
    workshopItems.value = workshopItems.value.map((item) =>
      item.publishedFileId === publishedFileId
        ? { ...item, visibility: targetVisibility }
        : item
    )
    statusMessage.value = `Visibility updated to ${visibilityLabel(targetVisibility)}: ${JSON.stringify(result)}`
    showToast({
      tone: 'success',
      title: 'Visibility Updated',
      detail: `Changed to ${visibilityLabel(targetVisibility)}.`
    })
  } catch (error) {
    handleActionFailure('visibility', error)
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

onMounted(async () => {
  syncFullscreenState()
  document.addEventListener('fullscreenchange', syncFullscreenState)
  document.addEventListener('keydown', onGlobalKeyDown)
  document.addEventListener('mousedown', onGlobalMouseDown)
  document.addEventListener('auxclick', onGlobalMouseDown)

  if (!(window as Window & { workshop?: unknown }).workshop) {
    statusMessage.value = 'Bridge error (bridge_unavailable): preload API not found. Restart the app/dev server.'
    isBootstrapping.value = false
    return
  }

  window.workshop.onRunEvent((event: RunEvent) => {
    if (event.type === 'run_started' && event.phase === 'login') {
      steamGuardSessionId.value = event.runId
      steamGuardCode.value = ''
      steamGuardPromptType.value = 'waiting'
      authIssue.value = null
      statusMessage.value = isStoredSessionLoginAttempt.value
        ? 'Checking saved Steam session...'
        : 'Signing in to Steam...'
    }

    if (event.type === 'steam_guard_required') {
      steamGuardSessionId.value = event.runId
      if (event.promptType === 'steam_guard_mobile') {
        steamGuardPromptType.value = 'steam_guard_mobile'
        statusMessage.value = isStoredSessionLoginAttempt.value
          ? 'Saved session requires Steam Guard approval. Approve on your phone now.'
          : 'Steam Guard mobile approval needed. Approve on your phone now.'
      } else {
        steamGuardPromptType.value = 'steam_guard_code'
        statusMessage.value = isStoredSessionLoginAttempt.value
          ? 'Saved session requires Steam Guard code. Enter code to continue.'
          : 'Steam Guard code required. Enter the code to continue.'
      }
    }
    if (event.line && /steam guard mobile authenticator/i.test(event.line)) {
      steamGuardSessionId.value = event.runId
      steamGuardPromptType.value = 'steam_guard_mobile'
      statusMessage.value = isStoredSessionLoginAttempt.value
        ? 'Saved session requires Steam Guard approval. Approve on your phone now.'
        : 'Steam Guard mobile approval needed. Approve on your phone now.'
    }
    if (event.line && /auth(?:entication)?\s*code|guard code|two-factor/i.test(event.line)) {
      steamGuardSessionId.value = event.runId
      steamGuardPromptType.value = 'steam_guard_code'
      statusMessage.value = isStoredSessionLoginAttempt.value
        ? 'Saved session requires Steam Guard code. Enter code to continue.'
        : 'Steam Guard code required. Enter the code to continue.'
    }
    if (
      event.line &&
      /waiting for compat in post-logon|waiting for user info|logged in ok|login complete|successfully logged/i.test(event.line)
    ) {
      steamGuardSessionId.value = event.runId
      steamGuardPromptType.value = 'steam_guard_approved'
      statusMessage.value = 'Steam Guard approved. Finalizing sign in...'
    }
    if (
      event.line &&
      /waiting for confirmation/i.test(event.line) &&
      steamGuardPromptType.value !== 'steam_guard_approved'
    ) {
      steamGuardSessionId.value = event.runId
      steamGuardPromptType.value = 'steam_guard_mobile'
      statusMessage.value = 'Steam Guard mobile approval pending. Check your Steam phone app.'
    }
    if (event.type === 'run_finished' && event.phase === 'login') {
      steamGuardSessionId.value = null
      steamGuardCode.value = ''
      steamGuardPromptType.value = 'none'
      authIssue.value = null
      isStoredSessionLoginAttempt.value = false
    }
    if (event.type === 'run_failed' && event.phase === 'login') {
      steamGuardCode.value = ''
      steamGuardPromptType.value = 'none'
      steamGuardSessionId.value = null
      isStoredSessionLoginAttempt.value = false
    }
    // Non-login phases have dedicated status/toast handling in action flows.
  })

  try {
    await Promise.all([ensureSteamCmdInstalled(), refreshRememberedLoginState(), loadAdvancedSettings()])
  } finally {
    isBootstrapping.value = false
  }
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', syncFullscreenState)
  document.removeEventListener('keydown', onGlobalKeyDown)
  document.removeEventListener('mousedown', onGlobalMouseDown)
  document.removeEventListener('auxclick', onGlobalMouseDown)
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
})
</script>

<template>
  <main class="steam-theme">
    <section v-if="isBootstrapping" class="fade-in splash-screen">
      <div class="splash-panel">
        <p class="splash-kicker">STEAM WORKSHOP MANAGER</p>
        <h1 class="splash-title">Initializing</h1>
        <p class="splash-subtitle">Preparing SteamCMD and saved session data...</p>
        <div class="splash-loader" role="status" aria-label="Loading">
          <span class="splash-loader-dot"></span>
          <span class="splash-loader-dot"></span>
          <span class="splash-loader-dot"></span>
        </div>
      </div>
      <p class="splash-disclaimer">* Not an official Steam product.</p>
    </section>

    <LoginSection
      v-else-if="!isAuthenticated"
      :status-message="loginHeaderStatusMessage"
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
      @submit-login="login"
      @set-password-peek="setPasswordPeek"
      @submit-guard-code="submitSteamGuardCode"
      @update-steam-guard-code="setSteamGuardCode"
      @toggle-advanced-options="toggleAdvancedOptions"
      @update-web-api-key="setWebApiKey"
      @set-web-api-key-peek="setWebApiKeyPeek"
      @save-advanced-settings="saveAdvancedSettings"
      @clear-web-api-key="clearSavedWebApiKey"
      @clear-stored-session="clearStoredSession"
    />

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
          :is-fullscreen="isFullscreen"
          :is-dev-mode="advancedSettings.hasWebApiKey"
          :profile-image-url="accountProfileImageUrl"
          @navigate="goToStep"
          @open-about="openAboutModal"
          @toggle-fullscreen="toggleFullscreen"
          @sign-out="signOut"
        />

        <WorkshopItemsSection
          v-show="flowStep === 'mods'"
          :app-id="workshopFilterAppId"
          :workshop-items="filteredWorkshopItems"
          :all-items-count="workshopItems.length"
          :visibility-filter="workshopVisibilityFilter"
          :selected-workshop-item-id="selectedWorkshopItemId"
          @change-app-id="onChangeAppId"
          @change-visibility-filter="onChangeWorkshopVisibilityFilter"
          @reset-filter="resetAppIdFilter"
          @refresh="loadWorkshopItems"
          @select-item="selectWorkshopItem"
        />

        <PublishSection
          v-show="flowStep === 'update' || flowStep === 'create'"
          :mode="activePublishMode"
          :selected-workshop-item="selectedWorkshopItem"
          :publish-checklist="activePublishChecklist"
          :draft="activeDraft"
          :tag-input="activeTagInput"
          :visibility-committed="committedVisibility"
          :visibility-pending="pendingVisibility"
          :can-change-visibility="canChangeVisibility"
          :staged-content-files="stagedContentFiles"
          :staged-content-tree="stagedContentTree"
          :total-staged-content-size-bytes="totalStagedContentSizeBytes"
          :can-upload="canCreate()"
          :can-update="canUpdate()"
          @go-to-mods="goToStep('mods')"
          @open-workshop-item="openSelectedWorkshopItem"
          @pick-content-folder="pickContentFolder"
          @pick-workspace-root="pickContentFolder"
          @clear-workspace="clearWorkspace"
          @pick-preview-file="pickPreviewFile"
          @clear-preview-file="clearPreviewFile"
          @change-tag-input="onChangeTagInput"
          @add-tag="addTag"
          @remove-tag="removeTag"
          @change-visibility-selection="setPendingVisibility"
          @update-visibility-only="updateVisibilityOnly"
          @upload="upload"
          @update-item="updateItem"
        />

        <div
          v-if="isAboutOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          @click.self="closeAboutModal"
        >
          <article class="w-full max-w-md rounded-xl border border-[#2a475e] bg-[#162534] p-5 shadow-2xl">
            <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">About</p>
            <h2 class="mt-1 text-xl font-bold text-slate-100">Steam Workshop Manager</h2>
            <p class="mt-2 text-sm text-slate-300">
              Developer utility for Steam Workshop uploads and updates.
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
