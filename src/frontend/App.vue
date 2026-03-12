<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { RunEvent, WorkshopItemSummary } from '@shared/contracts'
import AppTopBar from './components/AppTopBar.vue'
import LoginSection from './components/LoginSection.vue'
import PublishSection from './components/PublishSection.vue'
import WorkshopItemsSection from './components/WorkshopItemsSection.vue'
import './styles/themes/app.theme.css'
import type {
  AdvancedSettingsState,
  AuthIssue,
  FlowStep,
  LoginFormState,
  PublishChecklistItem,
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
    description: '',
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
    description: source.description,
    tags: [...source.tags]
  }
}

function applyDraft(target: UploadDraftState, source: UploadDraftState): void {
  target.appId = source.appId
  target.publishedFileId = source.publishedFileId
  target.contentFolder = source.contentFolder
  target.previewFile = source.previewFile
  target.title = source.title
  target.description = source.description
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

const uploadFiles = ref<string[]>([])
const isUploadDropActive = ref(false)
const isFullscreen = ref(false)
const isAboutOpen = ref(false)
const activeToast = ref<UiToast | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const selectedWorkshopItem = computed(() => workshopItems.value.find((item) => item.publishedFileId === selectedWorkshopItemId.value))
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

const updateChecklist = computed<PublishChecklistItem[]>(() => {
  return [
    { label: 'Steam login', ok: loginState.value === 'signed_in' },
    { label: 'Workshop item selected', ok: selectedWorkshopItemId.value.trim().length > 0 },
    { label: 'App ID', ok: updateDraft.appId.trim().length > 0 },
    { label: 'Content folder', ok: updateDraft.contentFolder.trim().length > 0 },
    { label: 'Preview image', ok: updateDraft.previewFile.trim().length > 0 },
    { label: 'Title', ok: updateDraft.title.trim().length > 0 },
    { label: 'Description', ok: updateDraft.description.trim().length > 0 },
    { label: 'Published File ID', ok: updateDraft.publishedFileId.trim().length > 0 }
  ]
})

const createChecklist = computed<PublishChecklistItem[]>(() => {
  return [
    { label: 'Steam login', ok: loginState.value === 'signed_in' },
    { label: 'App ID', ok: createDraft.appId.trim().length > 0 },
    { label: 'Content folder', ok: createDraft.contentFolder.trim().length > 0 },
    { label: 'Preview image', ok: createDraft.previewFile.trim().length > 0 },
    { label: 'Title', ok: createDraft.title.trim().length > 0 },
    { label: 'Description', ok: createDraft.description.trim().length > 0 }
  ]
})

const activePublishChecklist = computed<PublishChecklistItem[]>(() =>
  activePublishMode.value === 'create' ? createChecklist.value : updateChecklist.value
)

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

function fileNameFromPath(path: string): string {
  const segments = path.split(/[/\\]/)
  return segments[segments.length - 1] || path
}

function dedupePaths(paths: string[]): string[] {
  return [...new Set(paths.filter((path) => path.trim().length > 0))]
}

function stageUploadFiles(paths: string[]): void {
  uploadFiles.value = dedupePaths(paths)
  if (uploadFiles.value.length > 0) {
    statusMessage.value = `Staged ${uploadFiles.value.length} file(s) for upload verification.`
  }
}

function removeStagedFile(path: string): void {
  uploadFiles.value = uploadFiles.value.filter((item) => item !== path)
  statusMessage.value = `Removed staged file: ${fileNameFromPath(path)}`
}

async function pickUploadFiles(): Promise<void> {
  const paths = await window.workshop.pickFiles()
  if (!paths || paths.length === 0) {
    return
  }
  stageUploadFiles(paths)
}

function clearUploadFiles(): void {
  uploadFiles.value = []
}

function getParentFolder(path: string): string {
  return path.replace(/[\\/][^\\/]+$/, '')
}

function useStagedFolderAsContent(): void {
  if (uploadFiles.value.length === 0) {
    statusMessage.value = 'Stage at least one file first.'
    return
  }

  const folders = dedupePaths(uploadFiles.value.map(getParentFolder).filter((folder) => folder.trim().length > 0))
  if (folders.length !== 1) {
    statusMessage.value = 'Staged files must come from one folder to auto-fill content folder.'
    return
  }

  activeDraft.value.contentFolder = folders[0]
  statusMessage.value = `Content folder set from staged files: ${folders[0]}`
}

function onUploadDragOver(event: DragEvent): void {
  event.preventDefault()
  isUploadDropActive.value = true
}

function onUploadDragLeave(event: DragEvent): void {
  event.preventDefault()
  isUploadDropActive.value = false
}

function onUploadDrop(event: DragEvent): void {
  event.preventDefault()
  isUploadDropActive.value = false

  const files = event.dataTransfer?.files
  if (!files || files.length === 0) {
    return
  }

  const paths = Array.from(files)
    .map((file) => (file as File & { path?: string }).path)
    .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)

  if (paths.length > 0) {
    stageUploadFiles(paths)
    return
  }

  uploadFiles.value = dedupePaths(Array.from(files).map((file) => file.name))
  statusMessage.value = `Staged ${uploadFiles.value.length} dropped file name(s).`
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
): {
  appId: string
  publishedFileId?: string
  contentFolder: string
  previewFile: string
  title: string
  description: string
  tags: string[]
  visibility?: 0 | 1 | 2 | 3
} {
  return {
    appId: source.appId,
    publishedFileId: mode === 'update' ? source.publishedFileId || undefined : undefined,
    contentFolder: source.contentFolder,
    previewFile: source.previewFile,
    title: source.title,
    description: source.description,
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
  loginForm.rememberAuth = payload.rememberAuth === true
  if (payload.rememberAuth === true) {
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

async function finalizeSuccessfulLogin(successMessage: string): Promise<void> {
  loginState.value = 'signed_in'
  steamGuardSessionId.value = null
  steamGuardPromptType.value = 'none'
  authIssue.value = null
  statusMessage.value = successMessage
  loginForm.password = ''
  flowStep.value = 'mods'
  await Promise.all([loadWorkshopItems(), refreshCurrentProfile()])
}

async function tryAutoLoginWithStoredSession(): Promise<void> {
  if (!loginForm.rememberAuth || loginForm.username.trim().length === 0) {
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

  try {
    const usingSavedSession = loginForm.rememberAuth && loginForm.password.trim().length === 0
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
      rememberUsername: loginForm.rememberUsername,
      rememberAuth: loginForm.rememberAuth,
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
    if (isSavedSessionFallbackError(parsed) && loginForm.rememberAuth && loginForm.password.trim().length === 0) {
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
  }
}

async function pickPreviewFile(): Promise<void> {
  const path = await window.workshop.pickFile()
  if (path) {
    activeDraft.value.previewFile = path
  }
}

function canCreate(): boolean {
  return (
    loginState.value === 'signed_in' &&
    createDraft.appId.trim().length > 0 &&
    createDraft.contentFolder.trim().length > 0 &&
    createDraft.previewFile.trim().length > 0 &&
    createDraft.title.trim().length > 0 &&
    createDraft.description.trim().length > 0
  )
}

function canUpdate(): boolean {
  return (
    loginState.value === 'signed_in' &&
    selectedWorkshopItemId.value.trim().length > 0 &&
    updateDraft.appId.trim().length > 0 &&
    updateDraft.contentFolder.trim().length > 0 &&
    updateDraft.previewFile.trim().length > 0 &&
    updateDraft.title.trim().length > 0 &&
    updateDraft.description.trim().length > 0 &&
    updateDraft.publishedFileId.trim().length > 0
  )
}

async function upload(): Promise<void> {
  if (!canCreate()) {
    statusMessage.value = 'Upload blocked: complete required fields and login first.'
    return
  }

  const result = await window.workshop.uploadMod({
    profileId: 'new-item',
    draft: buildUploadDraft(createDraft, 'create')
  })

  statusMessage.value = `Upload completed: ${JSON.stringify(result)}`
}

async function updateItem(): Promise<void> {
  if (!canUpdate()) {
    statusMessage.value = 'Update blocked: publishedFileId is required.'
    return
  }

  const result = await window.workshop.updateMod({
    profileId: selectedWorkshopItemId.value || updateDraft.publishedFileId,
    draft: buildUploadDraft(updateDraft, 'update', pendingVisibility.value)
  })

  committedVisibility.value = pendingVisibility.value
  workshopItems.value = workshopItems.value.map((item) =>
    item.publishedFileId === selectedWorkshopItemId.value
      ? { ...item, visibility: committedVisibility.value }
      : item
  )
  statusMessage.value = `Update completed: ${JSON.stringify(result)}`
  delete updateDraftCache.value[selectedWorkshopItemId.value]
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
    const parsed = normalizeError(error)
    statusMessage.value = `Visibility update failed (${parsed.code}): ${parsed.message}`
    showToast({
      tone: 'error',
      title: 'Visibility Update Failed',
      detail: parsed.message
    })
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

  if (!(window as Window & { workshop?: unknown }).workshop) {
    statusMessage.value = 'Bridge error (bridge_unavailable): preload API not found. Restart the app/dev server.'
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
    if (event.type === 'run_started' && event.phase !== 'login') {
      statusMessage.value = `Run started (${event.phase ?? 'steamcmd'})`
    }
    if (event.type === 'run_finished' && event.phase !== 'login') {
      statusMessage.value = `Run finished (${event.phase ?? 'steamcmd'})`
    }
    if (event.type === 'run_failed' && event.phase !== 'login') {
      statusMessage.value = `Run failed (${event.errorCode ?? 'command_failed'})`
    }
  })

  await ensureSteamCmdInstalled()
  await refreshRememberedLoginState()
  await loadAdvancedSettings()
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', syncFullscreenState)
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
})
</script>

<template>
  <main class="steam-theme">
    <LoginSection
      v-if="!isAuthenticated"
      :status-message="loginHeaderStatusMessage"
      :is-login-submitting="isLoginSubmitting"
      :login-form="loginForm"
      :is-password-peek="isPasswordPeek"
      :auth-issue="authIssue"
      :steam-guard-prompt-type="steamGuardPromptType"
      :steam-guard-code="steamGuardCode"
      :is-stored-session-login-attempt="isStoredSessionLoginAttempt"
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
          :upload-files="uploadFiles"
          :is-upload-drop-active="isUploadDropActive"
          :can-upload="canCreate()"
          :can-update="canUpdate()"
          @go-to-mods="goToStep('mods')"
          @pick-content-folder="pickContentFolder"
          @pick-preview-file="pickPreviewFile"
          @change-tag-input="onChangeTagInput"
          @add-tag="addTag"
          @remove-tag="removeTag"
          @change-visibility-selection="setPendingVisibility"
          @update-visibility-only="updateVisibilityOnly"
          @upload="upload"
          @update-item="updateItem"
          @pick-upload-files="pickUploadFiles"
          @use-staged-folder-as-content="useStagedFolderAsContent"
          @clear-upload-files="clearUploadFiles"
          @upload-drag-over="onUploadDragOver"
          @upload-drag-leave="onUploadDragLeave"
          @upload-drop="onUploadDrop"
          @remove-staged-file="removeStagedFile"
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
