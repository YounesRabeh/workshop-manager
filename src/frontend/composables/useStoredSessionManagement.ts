/**
 * Overview: Isolates stored-session state and IPC interactions for login flows.
 * Responsibility: Tracks persisted vs current-login stored-session availability and
 * exposes helpers used by useAuthFlow to keep stored-auth behavior consistent.
 */
import { ref } from 'vue'

/** Tracks whether remembered Steam authentication may be reused or must be cleared. */
export function useStoredSessionManagement() {
  const hasPersistedStoredSession = ref(false)
  const canUseStoredSessionForCurrentLogin = ref(false)

  /** Checks whether the current state allows use stored session for login. */
  function canUseStoredSessionForLogin(): boolean {
    return canUseStoredSessionForCurrentLogin.value
  }

  /** Applies remembered profile state to the current state. */
  function applyRememberedProfileState(hasStoredAuth: boolean): void {
    hasPersistedStoredSession.value = hasStoredAuth
    canUseStoredSessionForCurrentLogin.value = hasStoredAuth
  }

  /** Records the state of stored session from remember auth. */
  function markStoredSessionFromRememberAuth(rememberAuth: boolean): void {
    hasPersistedStoredSession.value = rememberAuth
    canUseStoredSessionForCurrentLogin.value = rememberAuth
  }

  /** Disables stored session for current login and clears its enabled state. */
  function disableStoredSessionForCurrentLogin(): void {
    canUseStoredSessionForCurrentLogin.value = false
  }

  /** Resets flags that track whether saved authentication can be reused. */
  function clearStoredSessionFlags(): void {
    hasPersistedStoredSession.value = false
    canUseStoredSessionForCurrentLogin.value = false
  }

  /** Deletes saved Steam authentication and resets its related UI state. */
  async function clearStoredSession(): Promise<void> {
    await window.workshop.clearStoredSession()
    clearStoredSessionFlags()
  }

  return {
    hasPersistedStoredSession,
    canUseStoredSessionForCurrentLogin,
    canUseStoredSessionForLogin,
    applyRememberedProfileState,
    markStoredSessionFromRememberAuth,
    disableStoredSessionForCurrentLogin,
    clearStoredSessionFlags,
    clearStoredSession
  }
}
