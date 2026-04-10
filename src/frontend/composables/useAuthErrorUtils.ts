/**
 * Overview: Encapsulates auth-flow error normalization, logging, and issue classification.
 * Responsibility: Converts unknown errors to API failures, derives user-facing auth issues,
 * and handles SteamCMD missing-configuration status messaging side effects.
 */
import type { Ref } from 'vue'
import { logError, normalizeError as normalizeSharedError } from '@shared/api-error-utils'
import type { AuthIssue } from '../types/ui'

export interface ApiFailure {
  message: string
  code: string
}

interface UseAuthErrorUtilsOptions {
  statusMessage: Ref<string>
  authIssue: Ref<AuthIssue | null>
  onSteamCmdPathRequired?: () => void
}

export function useAuthErrorUtils(options: UseAuthErrorUtilsOptions) {
  function parseAndLogError(context: string, error: unknown): ApiFailure {
    const parsed = normalizeSharedError(error)
    logError(context, parsed)
    return {
      message: parsed.message,
      code: parsed.code
    }
  }

  function normalizeError(error: unknown): ApiFailure {
    const parsed = normalizeSharedError(error)
    return {
      message: parsed.message,
      code: parsed.code
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

  function isSteamCmdMissingConfigurationMessage(message: string): boolean {
    return (
      /steamcmd/i.test(message) &&
      /(not found|not configured|missing|no such file|cannot find|executable|path)/i.test(message)
    )
  }

  function handleSteamCmdMissingStatus(message: string): boolean {
    if (!isSteamCmdMissingConfigurationMessage(message)) {
      return false
    }

    options.onSteamCmdPathRequired?.()
    options.statusMessage.value = 'SteamCMD not found. Advanced options opened. Add the SteamCMD executable path.'
    options.authIssue.value = null
    return true
  }

  return {
    parseAndLogError,
    normalizeError,
    toAuthIssue,
    isSavedSessionFallbackError,
    isSteamCmdMissingConfigurationMessage,
    handleSteamCmdMissingStatus
  }
}
