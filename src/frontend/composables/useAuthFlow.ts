import { computed, reactive, ref } from 'vue'
import type { RunEvent } from '@shared/contracts'
import type {
  AdvancedSettingsState,
  AuthIssue,
  LoginFormState,
  SteamGuardPromptType
} from '../types/ui'

export interface ApiFailure {
  message: string
  code: string
}

interface UseAuthFlowOptions {
  onShowTimeoutLogs: () => Promise<void>
  onHideTimeoutLogs: () => void
  onSignedIn: () => Promise<void>
  onSignedOut: () => void
}

export function useAuthFlow(options: UseAuthFlowOptions) {
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
  const isSteamCmdDetected = ref(false)
  const isAdvancedOptionsOpen = ref(false)
  const accountPersonaName = ref<string>('')
  const accountProfileImageUrl = ref<string | null>(null)

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

  const isAuthenticated = computed(() => loginState.value === 'signed_in')
  const canAccessMods = computed(() => loginState.value === 'signed_in')
  const accountDisplayName = computed(() => accountPersonaName.value || loginForm.username.trim() || 'Steam account')
  const loginHeaderStatusMessage = computed(() => (isSteamCmdDetected.value ? 'SteamCMD found ✓' : ''))

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
    options.onHideTimeoutLogs()
    steamGuardSessionId.value = null
    steamGuardPromptType.value = 'none'
    authIssue.value = null
    statusMessage.value = successMessage
    loginForm.password = ''
    hasPersistedStoredSession.value = loginForm.rememberAuth
    await options.onSignedIn()
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
      if (parsed.code === 'timeout') {
        await options.onShowTimeoutLogs()
      }
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

  async function loadAppVersion(appVersionRef: { value: string }): Promise<void> {
    try {
      const payload = await window.workshop.getAppVersion()
      const version = payload?.version?.trim()
      if (version) {
        appVersionRef.value = version
      }
    } catch {
      appVersionRef.value = 'dev'
    }
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
      if (parsed.code === 'timeout') {
        await options.onShowTimeoutLogs()
      }
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
    authIssue.value = null
    isStoredSessionLoginAttempt.value = false
    isPasswordPeek.value = false
    statusMessage.value = 'Signed out.'
    accountPersonaName.value = ''
    accountProfileImageUrl.value = null
    options.onHideTimeoutLogs()
    options.onSignedOut()
  }

  async function quitApp(): Promise<void> {
    try {
      await window.workshop.quitApp()
    } catch {
      // no-op; app may already be closing
    }
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

  function handleRunEvent(event: RunEvent): void {
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
  }

  return {
    loginState,
    steamGuardSessionId,
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
    loginForm,
    advancedSettings,
    accountPersonaName,
    accountProfileImageUrl,
    isAuthenticated,
    canAccessMods,
    accountDisplayName,
    loginHeaderStatusMessage,
    normalizeError,
    toAuthIssue,
    canUseStoredSessionForLogin,
    setPasswordPeek,
    setWebApiKeyPeek,
    setWebApiKey,
    toggleAdvancedOptions,
    setSteamGuardCode,
    ensureSteamCmdInstalled,
    refreshRememberedLoginState,
    loadAdvancedSettings,
    saveAdvancedSettings,
    clearSavedWebApiKey,
    clearStoredSession,
    tryAutoLoginWithStoredSession,
    refreshCurrentProfile,
    loadAppVersion,
    login,
    signOut,
    quitApp,
    submitSteamGuardCode,
    handleRunEvent
  }
}
