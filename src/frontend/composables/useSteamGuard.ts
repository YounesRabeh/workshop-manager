/**
 * Overview: Encapsulates Steam Guard challenge state and OTP submission behavior.
 * Responsibility: Tracks active challenge mode/prompt state and performs queued or immediate
 * OTP submissions based on run lifecycle and Steam Guard prompt timing.
 */
import { ref, type Ref } from 'vue'
import type {
  ActiveChallengeMode,
  AuthIssue,
  PreferredAuthMode,
  SteamGuardPromptType
} from '../types/ui'
import type { ApiFailure } from './useAuthErrorUtils'

interface UseSteamGuardOptions {
  preferredAuthMode: Ref<PreferredAuthMode>
  isLoginSubmitting: Ref<boolean>
  statusMessage: Ref<string>
  authIssue: Ref<AuthIssue | null>
  parseAndLogError: (context: string, error: unknown) => ApiFailure
  toAuthIssue: (error: ApiFailure) => AuthIssue
}

export function useSteamGuard(options: UseSteamGuardOptions) {
  const steamGuardSessionId = ref<string | null>(null)
  const steamGuardCode = ref('')
  const steamGuardPromptType = ref<SteamGuardPromptType>('none')
  const activeChallengeMode = ref<ActiveChallengeMode>('none')
  const queuedOtpCode = ref('')
  const queuedOtpRunId = ref<string | null>(null)

  function hasQueuedOtp(): boolean {
    return queuedOtpCode.value.trim().length > 0
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

  function setSteamGuardCode(value: string): void {
    steamGuardCode.value = value
  }

  function clearQueuedOtp(): void {
    queuedOtpCode.value = ''
    queuedOtpRunId.value = null
  }

  function bindQueuedOtpToRun(runId: string): void {
    if (!hasQueuedOtp()) {
      return
    }

    if (!queuedOtpRunId.value) {
      queuedOtpRunId.value = runId
      return
    }

    if (queuedOtpRunId.value !== runId) {
      clearQueuedOtp()
    }
  }

  function resetSteamGuardState(): void {
    steamGuardSessionId.value = null
    steamGuardCode.value = ''
    steamGuardPromptType.value = 'none'
    activeChallengeMode.value = 'none'
    clearQueuedOtp()
  }

  async function submitOtpCodeToSteam(sessionId: string, code: string): Promise<void> {
    options.authIssue.value = null
    await window.workshop.submitSteamGuardCode({
      sessionId,
      code
    })
    options.statusMessage.value = 'OTP / Email code submitted. Waiting for Steam...'
  }

  async function submitQueuedOtpIfReady(runId: string): Promise<void> {
    bindQueuedOtpToRun(runId)

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
      const parsed = options.parseAndLogError('useAuthFlow::submitQueuedOtpIfReady', error)
      options.statusMessage.value = `OTP / Email code failed (${parsed.code}): ${parsed.message}`
      options.authIssue.value = options.toAuthIssue(parsed)
      steamGuardCode.value = code
    }
  }

  async function submitSteamGuardCode(): Promise<void> {
    const sessionId = steamGuardSessionId.value
    const code = steamGuardCode.value.trim()

    if (code.length === 0) {
      return
    }

    const shouldQueueOtp =
      options.isLoginSubmitting.value &&
      (activeChallengeMode.value === 'otp' || options.preferredAuthMode.value === 'otp')
    if (!sessionId || steamGuardPromptType.value !== 'steam_guard_code') {
      if (!shouldQueueOtp) {
        return
      }

      queuedOtpCode.value = code
      queuedOtpRunId.value = sessionId
      steamGuardCode.value = ''
      options.statusMessage.value = sessionId
        ? 'OTP / Email code saved. Waiting for Steam challenge...'
        : 'OTP / Email code saved. Waiting for login session...'
      return
    }

    try {
      await submitOtpCodeToSteam(sessionId, code)
      steamGuardCode.value = ''
      clearQueuedOtp()
    } catch (error) {
      const parsed = options.parseAndLogError('useAuthFlow::submitSteamGuardCode', error)
      options.statusMessage.value = `OTP / Email code failed (${parsed.code}): ${parsed.message}`
      options.authIssue.value = options.toAuthIssue(parsed)
    }
  }

  function applyOtpChallengeStatus(fromSavedSession: boolean): void {
    setChallengeState('otp')
    if (fromSavedSession) {
      options.statusMessage.value = 'Saved session requires OTP / Email code. Enter the code to continue.'
      return
    }
    options.statusMessage.value =
      options.preferredAuthMode.value === 'steam_guard_mobile'
        ? 'Steam requested OTP / Email code for this sign-in. Enter the code to continue.'
        : 'OTP / Email code required. Enter the code to continue.'
  }

  function applyMobileChallengeStatus(fromSavedSession: boolean): void {
    setChallengeState('steam_guard_mobile')
    if (fromSavedSession) {
      options.statusMessage.value = 'Saved session requires Steam app approval. Approve on your phone now.'
      return
    }
    options.statusMessage.value =
      options.preferredAuthMode.value === 'otp'
        ? 'Steam requested mobile app approval for this sign-in. Approve in the Steam mobile app to continue.'
        : 'Steam app approval needed. Approve on your phone now.'
  }

  return {
    steamGuardSessionId,
    steamGuardCode,
    steamGuardPromptType,
    activeChallengeMode,
    setSteamGuardCode,
    clearQueuedOtp,
    bindQueuedOtpToRun,
    resetSteamGuardState,
    submitQueuedOtpIfReady,
    submitSteamGuardCode,
    applyOtpChallengeStatus,
    applyMobileChallengeStatus
  }
}
