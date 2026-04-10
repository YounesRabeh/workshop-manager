/**
 * Overview: Manages frontend authentication state and Steam session interactions.
 * Responsibility: Handles login/logout/guard flows, advanced settings persistence, profile loading, and run-event auth state updates.
 */
import { computed, reactive, ref } from 'vue'
import type { PreferredAuthMode as SharedPreferredAuthMode, RunEvent } from '@shared/contracts'
import type {
  ActiveChallengeMode,
  AuthIssue,
  LoginFormState,
  PreferredAuthMode,
  SteamGuardPromptType
} from '../types/ui'
import { useAdvancedSettings } from './useAdvancedSettings'

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
  const activeLoginRunId = ref<string | null>(null)
  const steamGuardSessionId = ref<string | null>(null)
  const steamGuardCode = ref('')
  const isPasswordPeek = ref(false)
  const isWebApiKeyPeek = ref(false)
  const steamGuardPromptType = ref<SteamGuardPromptType>('none')
  const preferredAuthMode = ref<PreferredAuthMode>('otp')
  const activeChallengeMode = ref<ActiveChallengeMode>('none')
  const queuedOtpCode = ref('')
  const queuedOtpRunId = ref<string | null>(null)
  const isStoredSessionLoginAttempt = ref(false)
  const hasPersistedStoredSession = ref(false)
  const canUseStoredSessionForCurrentLogin = ref(false)
  const isLoginSubmitting = ref(false)
  const statusMessage = ref<string>('')
  const authIssue = ref<AuthIssue | null>(null)
  const accountPersonaName = ref<string>('')
  const accountProfileImageUrl = ref<string | null>(null)

  const loginForm = reactive<LoginFormState>({
    username: '',
    password: '',
    rememberUsername: true,
    rememberAuth: false
  })

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
    ensureSteamCmdInstalled,
    openInstallLog,
    loadAdvancedSettings,
    pickSteamCmdManualPath,
    saveAdvancedSettings,
    clearSavedWebApiKey
  } = useAdvancedSettings({
    normalizeError,
    setStatusMessage: (message) => {
      statusMessage.value = message
    }
  })

  const isAuthenticated = computed(() => loginState.value === 'signed_in')
  const canAccessMods = computed(() => loginState.value === 'signed_in')
  const accountDisplayName = computed(() => accountPersonaName.value || loginForm.username.trim() || 'Steam account')
  const loginHeaderStatusMessage = computed(() => statusMessage.value || (isSteamCmdDetected.value ? 'SteamCMD found ✓' : ''))

  function normalizePreferredAuthMode(mode: SharedPreferredAuthMode | undefined): PreferredAuthMode {
    return mode === 'steam_guard_mobile' ? 'steam_guard_mobile' : 'otp'
  }

  function setChallengeState(mode: ActiveChallengeMode): void {
    activeChallengeMode.value = mode
    if (mode === 'otp') {
      steamGuardPromptType.value = 'steam_guard_code'
      return
    }
    if (mode === 'steam_guard_mobile') {
      steamGuardPromptType.value = 'steam_guard_mobile'
      return
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
        title: 'Invalid OTP / Email Code',
        detail: 'The entered OTP / Email code is invalid or expired.',
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
        title: 'Verification Required',
        detail: error.message,
        hint: 'Complete OTP / Email code or Steam app approval, then retry if needed.',
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
    return canUseStoredSessionForCurrentLogin.value
  }

  function setLoginUsername(value: string): void {
    loginForm.username = value
  }

  function setLoginPassword(value: string): void {
    loginForm.password = value
  }

  function setRememberUsername(value: boolean): void {
    loginForm.rememberUsername = value || loginForm.rememberAuth
  }

  function setRememberAuth(value: boolean): void {
    loginForm.rememberAuth = value
    if (value) {
      loginForm.rememberUsername = true
    }
  }

  function setPreferredAuthMode(value: PreferredAuthMode): void {
    preferredAuthMode.value = normalizePreferredAuthMode(value)
  }

  function setPasswordPeek(value: boolean): void {
    isPasswordPeek.value = value
  }

  function setWebApiKeyPeek(value: boolean): void {
    isWebApiKeyPeek.value = value
  }

  function setSteamGuardCode(value: string): void {
    steamGuardCode.value = value
  }

  function clearQueuedOtp(): void {
    queuedOtpCode.value = ''
    queuedOtpRunId.value = null
  }

  async function refreshRememberedLoginState(): Promise<void> {
    const payload = await window.workshop.getProfiles()
    const rememberedUsername = payload.rememberedUsername?.trim() ?? ''
    loginForm.username = rememberedUsername
    loginForm.rememberUsername = rememberedUsername.length > 0
    preferredAuthMode.value = normalizePreferredAuthMode(payload.preferredAuthMode)
    const hasStoredAuth = payload.hasStoredAuth === true
    loginForm.rememberAuth = payload.rememberAuth === true && hasStoredAuth
    hasPersistedStoredSession.value = hasStoredAuth
    canUseStoredSessionForCurrentLogin.value = hasStoredAuth
    if (loginForm.rememberAuth) {
      loginForm.rememberUsername = true
    }
  }

  async function clearStoredSession(): Promise<void> {
    if (isLoginSubmitting.value) {
      return
    }

    try {
      await window.workshop.clearStoredSession()
      hasPersistedStoredSession.value = false
      canUseStoredSessionForCurrentLogin.value = false
      loginForm.rememberAuth = false
      loginForm.password = ''
      isPasswordPeek.value = false
      isStoredSessionLoginAttempt.value = false
      steamGuardSessionId.value = null
      steamGuardCode.value = ''
      clearQueuedOtp()
      activeLoginRunId.value = null
      steamGuardPromptType.value = 'none'
      activeChallengeMode.value = 'none'
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
    activeLoginRunId.value = null
    steamGuardPromptType.value = 'none'
    activeChallengeMode.value = 'none'
    clearQueuedOtp()
    authIssue.value = null
    statusMessage.value = successMessage
    loginForm.password = ''
    hasPersistedStoredSession.value = loginForm.rememberAuth
    canUseStoredSessionForCurrentLogin.value = loginForm.rememberAuth
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
      activeLoginRunId.value = null
      steamGuardSessionId.value = null
      steamGuardCode.value = ''
      clearQueuedOtp()
      steamGuardPromptType.value = 'waiting'
      activeChallengeMode.value = 'none'
      statusMessage.value = 'Restoring saved Steam session...'
      await window.workshop.login({
        username: loginForm.username,
        password: '',
        rememberUsername: true,
        rememberAuth: true,
        useStoredAuth: true,
        preferredAuthMode: preferredAuthMode.value
      })
      await finalizeSuccessfulLogin('Signed in with saved Steam session. Loading workshop items...')
    } catch (error) {
      const parsed = normalizeError(error)
      if (parsed.code === 'timeout') {
        await options.onShowTimeoutLogs()
      }
      if (isSavedSessionFallbackError(parsed)) {
        activeLoginRunId.value = null
        steamGuardPromptType.value = 'none'
        activeChallengeMode.value = 'none'
        steamGuardSessionId.value = null
        clearQueuedOtp()
        authIssue.value = null
        canUseStoredSessionForCurrentLogin.value = false
        statusMessage.value = 'Saved session expired. Enter password to sign in again.'
        return
      }
      activeLoginRunId.value = null
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
      clearQueuedOtp()
      steamGuardPromptType.value = 'waiting'
      activeChallengeMode.value = 'none'
      statusMessage.value = usingSavedSession
        ? 'Signing in with saved Steam session...'
        : preferredAuthMode.value === 'steam_guard_mobile'
          ? 'Signing in to Steam... Preferred method: Steam app approval.'
          : 'Signing in to Steam... Preferred method: OTP / Email code.'
      await window.workshop.login({
        username: loginForm.username,
        password: usingSavedSession ? '' : loginForm.password,
        rememberUsername,
        rememberAuth,
        useStoredAuth: usingSavedSession,
        preferredAuthMode: preferredAuthMode.value
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
      activeChallengeMode.value = 'none'
      activeLoginRunId.value = null
      steamGuardSessionId.value = null
      clearQueuedOtp()
      if (isSavedSessionFallbackError(parsed) && usingSavedSession) {
        canUseStoredSessionForCurrentLogin.value = false
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
    activeLoginRunId.value = null
    steamGuardSessionId.value = null
    steamGuardCode.value = ''
    clearQueuedOtp()
    steamGuardPromptType.value = 'none'
    activeChallengeMode.value = 'none'
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
    if (!loginForm.rememberAuth && hasPersistedStoredSession.value) {
      await clearStoredSession()
      if (hasPersistedStoredSession.value) {
        return
      }
    }

    try {
      await window.workshop.quitApp()
    } catch {
      // no-op; app may already be closing
    }
  }

  async function submitOtpCodeToSteam(sessionId: string, code: string): Promise<void> {
    authIssue.value = null
    await window.workshop.submitSteamGuardCode({
      sessionId,
      code
    })
    statusMessage.value = 'OTP / Email code submitted. Waiting for Steam...'
  }

  async function submitQueuedOtpIfReady(runId: string): Promise<void> {
    if (
      steamGuardPromptType.value !== 'steam_guard_code' ||
      steamGuardSessionId.value !== runId ||
      queuedOtpCode.value.trim().length === 0 ||
      queuedOtpRunId.value !== runId
    ) {
      return
    }

    const code = queuedOtpCode.value.trim()
    clearQueuedOtp()
    steamGuardCode.value = ''

    try {
      await submitOtpCodeToSteam(runId, code)
    } catch (error) {
      const parsed = normalizeError(error)
      statusMessage.value = `OTP / Email code failed (${parsed.code}): ${parsed.message}`
      authIssue.value = toAuthIssue(parsed)
      steamGuardCode.value = code
    }
  }

  async function submitSteamGuardCode(): Promise<void> {
    const sessionId = steamGuardSessionId.value
    const code = steamGuardCode.value.trim()

    if (!sessionId || code.length === 0) {
      return
    }

    if (steamGuardPromptType.value !== 'steam_guard_code') {
      if (isLoginSubmitting.value && activeChallengeMode.value === 'otp') {
        queuedOtpCode.value = code
        queuedOtpRunId.value = sessionId
        steamGuardCode.value = ''
        statusMessage.value = 'OTP / Email code saved. Waiting for Steam challenge...'
      }
      return
    }

    try {
      await submitOtpCodeToSteam(sessionId, code)
      steamGuardCode.value = ''
      clearQueuedOtp()
    } catch (error) {
      const parsed = normalizeError(error)
      statusMessage.value = `OTP / Email code failed (${parsed.code}): ${parsed.message}`
      authIssue.value = toAuthIssue(parsed)
    }
  }

  function applyOtpChallengeStatus(fromSavedSession: boolean): void {
    setChallengeState('otp')
    if (fromSavedSession) {
      statusMessage.value = 'Saved session requires OTP / Email code. Enter the code to continue.'
      return
    }
    statusMessage.value =
      preferredAuthMode.value === 'steam_guard_mobile'
        ? 'Steam requested OTP / Email code for this sign-in. Enter the code to continue.'
        : 'OTP / Email code required. Enter the code to continue.'
  }

  function applyMobileChallengeStatus(fromSavedSession: boolean): void {
    setChallengeState('steam_guard_mobile')
    if (fromSavedSession) {
      statusMessage.value = 'Saved session requires Steam app approval. Approve on your phone now.'
      return
    }
    statusMessage.value =
      preferredAuthMode.value === 'otp'
        ? 'Steam requested mobile app approval for this sign-in. Approve in the Steam mobile app to continue.'
        : 'Steam app approval needed. Approve on your phone now.'
  }

  function handleRunEvent(event: RunEvent): void {
    if (event.type === 'run_started' && event.phase === 'login') {
      activeLoginRunId.value = event.runId
      steamGuardSessionId.value = event.runId
      steamGuardCode.value = ''
      clearQueuedOtp()
      steamGuardPromptType.value = 'waiting'
      activeChallengeMode.value = isStoredSessionLoginAttempt.value
        ? 'none'
        : preferredAuthMode.value === 'otp'
          ? 'otp'
          : 'none'
      authIssue.value = null
      statusMessage.value = isStoredSessionLoginAttempt.value
        ? 'Checking saved Steam session...'
        : preferredAuthMode.value === 'otp'
          ? 'Sign-in request sent. Enter OTP / Email code to continue.'
          : 'Signing in to Steam...'
    }

    if (event.phase !== 'login' || event.runId !== activeLoginRunId.value) {
      return
    }

    if (event.type === 'steam_guard_required') {
      steamGuardSessionId.value = event.runId
      if (event.promptType === 'steam_guard_mobile') {
        applyMobileChallengeStatus(isStoredSessionLoginAttempt.value)
      } else {
        applyOtpChallengeStatus(isStoredSessionLoginAttempt.value)
        void submitQueuedOtpIfReady(event.runId)
      }
    }

    if (event.line && /steam guard mobile authenticator/i.test(event.line)) {
      steamGuardSessionId.value = event.runId
      applyMobileChallengeStatus(isStoredSessionLoginAttempt.value)
    }

    if (event.line && /auth(?:entication)?\s*code|guard code|two-factor|otp|email code|one-time/i.test(event.line)) {
      steamGuardSessionId.value = event.runId
      applyOtpChallengeStatus(isStoredSessionLoginAttempt.value)
      void submitQueuedOtpIfReady(event.runId)
    }

    if (
      event.line &&
      /waiting for compat in post-logon(?:.*ok)?|waiting for user info(?:.*ok)?|logged in ok|login complete|successfully logged/i.test(
        event.line
      )
    ) {
      steamGuardSessionId.value = event.runId
      steamGuardPromptType.value = 'steam_guard_approved'
      activeChallengeMode.value = 'none'
      statusMessage.value = 'Verification approved. Finalizing sign in...'
    }

    if (
      event.line &&
      /waiting for confirmation/i.test(event.line) &&
      steamGuardPromptType.value !== 'steam_guard_approved'
    ) {
      steamGuardSessionId.value = event.runId
      applyMobileChallengeStatus(isStoredSessionLoginAttempt.value)
    }

    if (event.type === 'run_finished' && event.phase === 'login') {
      activeLoginRunId.value = null
      steamGuardSessionId.value = null
      steamGuardCode.value = ''
      clearQueuedOtp()
      steamGuardPromptType.value = 'none'
      activeChallengeMode.value = 'none'
      authIssue.value = null
      isStoredSessionLoginAttempt.value = false
    }

    if (event.type === 'run_failed' && event.phase === 'login') {
      activeLoginRunId.value = null
      steamGuardCode.value = ''
      clearQueuedOtp()
      steamGuardPromptType.value = 'none'
      activeChallengeMode.value = 'none'
      steamGuardSessionId.value = null
      isStoredSessionLoginAttempt.value = false
    }

    if (event.type === 'run_cancelled' && event.phase === 'login') {
      activeLoginRunId.value = null
      steamGuardCode.value = ''
      clearQueuedOtp()
      steamGuardPromptType.value = 'none'
      activeChallengeMode.value = 'none'
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
    preferredAuthMode,
    activeChallengeMode,
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
    accountPersonaName,
    accountProfileImageUrl,
    isAuthenticated,
    canAccessMods,
    accountDisplayName,
    loginHeaderStatusMessage,
    normalizeError,
    toAuthIssue,
    canUseStoredSessionForLogin,
    setLoginUsername,
    setLoginPassword,
    setRememberUsername,
    setRememberAuth,
    setPreferredAuthMode,
    setPasswordPeek,
    setWebApiKeyPeek,
    setWebApiKey,
    setSteamCmdManualPath,
    setLoginTimeoutMs,
    setStoredSessionTimeoutMs,
    setWorkshopTimeoutMs,
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
