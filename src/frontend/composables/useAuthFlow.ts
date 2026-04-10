/**
 * Overview: Manages frontend authentication state and Steam session interactions.
 * Responsibility: Handles login/logout orchestration, Steam Guard run-event updates,
 * advanced settings integration points, and profile loading through focused sub-composables.
 */
import { computed, ref } from 'vue'
import type { PreferredAuthMode as SharedPreferredAuthMode, RunEvent } from '@shared/contracts'
import { logError, normalizeError as normalizeSharedError } from '@shared/api-error-utils'
import type {
  AuthIssue,
  PreferredAuthMode
} from '../types/ui'
import { useStoredSessionManagement } from './useStoredSessionManagement'
import { useAuthErrorUtils } from './useAuthErrorUtils'
import { useLoginForm } from './useLoginForm'
import { useSteamGuard } from './useSteamGuard'
import { useSteamProfile } from './useSteamProfile'

export type { ApiFailure } from './useAuthErrorUtils'

interface UseAuthFlowOptions {
  onShowTimeoutLogs: () => Promise<void>
  onHideTimeoutLogs: () => void
  onSignedIn: () => Promise<void>
  onSignedOut: () => void
  onSteamCmdPathRequired?: () => void
}

export function useAuthFlow(options: UseAuthFlowOptions) {
  const loginState = ref<'signed_out' | 'signed_in'>('signed_out')
  const activeLoginRunId = ref<string | null>(null)
  const preferredAuthMode = ref<PreferredAuthMode>('otp')
  const isStoredSessionLoginAttempt = ref(false)
  const isLoginSubmitting = ref(false)
  const statusMessage = ref<string>('')
  const authIssue = ref<AuthIssue | null>(null)

  const {
    hasPersistedStoredSession,
    canUseStoredSessionForLogin,
    applyRememberedProfileState,
    markStoredSessionFromRememberAuth,
    disableStoredSessionForCurrentLogin,
    clearStoredSession: clearStoredSessionPersistedState
  } = useStoredSessionManagement()

  function normalizePreferredAuthMode(mode: SharedPreferredAuthMode | undefined): PreferredAuthMode {
    return mode === 'steam_guard_mobile' ? 'steam_guard_mobile' : 'otp'
  }

  const {
    loginForm,
    isPasswordPeek,
    setLoginUsername,
    setLoginPassword,
    setRememberUsername,
    setRememberAuth,
    setPasswordPeek,
    refreshRememberedLoginState
  } = useLoginForm({
    applyRememberedProfileState,
    onPreferredAuthModeLoaded: (mode) => {
      preferredAuthMode.value = mode
    },
    normalizePreferredAuthMode
  })

  const {
    parseAndLogError,
    normalizeError,
    toAuthIssue,
    isSavedSessionFallbackError,
    handleSteamCmdMissingStatus
  } = useAuthErrorUtils({
    statusMessage,
    authIssue,
    onSteamCmdPathRequired: options.onSteamCmdPathRequired
  })

  const {
    steamGuardSessionId,
    steamGuardCode,
    steamGuardPromptType,
    activeChallengeMode,
    setSteamGuardCode,
    bindQueuedOtpToRun,
    resetSteamGuardState,
    submitQueuedOtpIfReady,
    submitSteamGuardCode,
    applyOtpChallengeStatus,
    applyMobileChallengeStatus
  } = useSteamGuard({
    preferredAuthMode,
    isLoginSubmitting,
    statusMessage,
    authIssue,
    parseAndLogError,
    toAuthIssue
  })

  const {
    accountPersonaName,
    accountProfileImageUrl,
    refreshCurrentProfile,
    clearProfile
  } = useSteamProfile()

  const isAuthenticated = computed(() => loginState.value === 'signed_in')
  const canAccessMods = computed(() => loginState.value === 'signed_in')
  const accountDisplayName = computed(() => accountPersonaName.value || loginForm.username.trim() || 'Steam account')

  function setPreferredAuthMode(value: PreferredAuthMode): void {
    preferredAuthMode.value = normalizePreferredAuthMode(value)
  }

  async function clearStoredSession(): Promise<void> {
    if (isLoginSubmitting.value) {
      return
    }

    try {
      await clearStoredSessionPersistedState()
      loginForm.rememberAuth = false
      loginForm.password = ''
      isPasswordPeek.value = false
      isStoredSessionLoginAttempt.value = false
      activeLoginRunId.value = null
      resetSteamGuardState()
      authIssue.value = null
      statusMessage.value = 'Saved session cleared. Enter password to sign in.'
    } catch (error) {
      const parsed = parseAndLogError('useAuthFlow::clearStoredSession', error)
      statusMessage.value = `Clear session failed (${parsed.code}): ${parsed.message}`
    }
  }

  async function finalizeSuccessfulLogin(successMessage: string): Promise<void> {
    loginState.value = 'signed_in'
    options.onHideTimeoutLogs()
    activeLoginRunId.value = null
    resetSteamGuardState()
    authIssue.value = null
    statusMessage.value = successMessage
    loginForm.password = ''
    markStoredSessionFromRememberAuth(loginForm.rememberAuth)
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
      resetSteamGuardState()
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
      const parsed = parseAndLogError('useAuthFlow::tryAutoLoginWithStoredSession', error)
      if (parsed.code === 'timeout') {
        await options.onShowTimeoutLogs()
      }
      if (handleSteamCmdMissingStatus(parsed.message)) {
        return
      }
      if (isSavedSessionFallbackError(parsed)) {
        activeLoginRunId.value = null
        resetSteamGuardState()
        authIssue.value = null
        disableStoredSessionForCurrentLogin()
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

  async function loadAppVersion(appVersionRef: { value: string }): Promise<void> {
    try {
      const payload = await window.workshop.getAppVersion()
      const version = payload?.version?.trim()
      if (version) {
        appVersionRef.value = version
      }
    } catch (error) {
      logError('useAuthFlow::loadAppVersion', normalizeSharedError(error))
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
      resetSteamGuardState()
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
      const parsed = parseAndLogError('useAuthFlow::login', error)
      if (parsed.code === 'timeout') {
        await options.onShowTimeoutLogs()
      }
      activeLoginRunId.value = null
      resetSteamGuardState()
      if (handleSteamCmdMissingStatus(parsed.message)) {
        return
      }
      if (isSavedSessionFallbackError(parsed) && usingSavedSession) {
        disableStoredSessionForCurrentLogin()
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
    } catch (error) {
      logError('useAuthFlow::signOut', normalizeSharedError(error))
      // keep local sign out even if backend IPC fails
    }

    loginState.value = 'signed_out'
    activeLoginRunId.value = null
    resetSteamGuardState()
    authIssue.value = null
    isStoredSessionLoginAttempt.value = false
    isPasswordPeek.value = false
    statusMessage.value = 'Signed out.'
    clearProfile()
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
    } catch (error) {
      logError('useAuthFlow::quitApp', normalizeSharedError(error))
      // no-op; app may already be closing
    }
  }

  function handleRunEvent(event: RunEvent): void {
    if (event.type === 'run_started' && event.phase === 'login') {
      activeLoginRunId.value = event.runId
      steamGuardSessionId.value = event.runId
      bindQueuedOtpToRun(event.runId)
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

    if (
      event.line &&
      /auth(?:entication)?\s*code|guard code|two-factor|otp|email code|one-time|login\s*<username>\s*\[<password>\]\s*\[<[^>\r\n]*code[^>\r\n]*>\]/i.test(
        event.line
      )
    ) {
      steamGuardSessionId.value = event.runId
      applyOtpChallengeStatus(isStoredSessionLoginAttempt.value)
      void submitQueuedOtpIfReady(event.runId)
    }

    if (
      event.line &&
      /logging in user .* to steam public\.\.\.ok|waiting for client config(?:.*ok)?|waiting for compat in post-logon(?:.*ok)?|waiting for user info(?:.*ok)?|logged in ok|login complete|successfully logged/i.test(
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
      resetSteamGuardState()
      authIssue.value = null
      isStoredSessionLoginAttempt.value = false
    }

    if (event.type === 'run_failed' && event.phase === 'login') {
      activeLoginRunId.value = null
      resetSteamGuardState()
      isStoredSessionLoginAttempt.value = false
    }

    if (event.type === 'run_cancelled' && event.phase === 'login') {
      activeLoginRunId.value = null
      resetSteamGuardState()
      isStoredSessionLoginAttempt.value = false
    }
  }

  return {
    loginState,
    steamGuardSessionId,
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
    accountPersonaName,
    accountProfileImageUrl,
    isAuthenticated,
    canAccessMods,
    accountDisplayName,
    normalizeError,
    toAuthIssue,
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
