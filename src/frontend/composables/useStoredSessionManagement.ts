/**
 * Overview: Isolates stored-session state and IPC interactions for login flows.
 * Responsibility: Tracks persisted vs current-login stored-session availability and
 * exposes helpers used by useAuthFlow to keep stored-auth behavior consistent.
 */
import { ref } from 'vue'

export function useStoredSessionManagement() {
  const hasPersistedStoredSession = ref(false)
  const canUseStoredSessionForCurrentLogin = ref(false)

  function canUseStoredSessionForLogin(): boolean {
    return canUseStoredSessionForCurrentLogin.value
  }

  function applyRememberedProfileState(hasStoredAuth: boolean): void {
    hasPersistedStoredSession.value = hasStoredAuth
    canUseStoredSessionForCurrentLogin.value = hasStoredAuth
  }

  function markStoredSessionFromRememberAuth(rememberAuth: boolean): void {
    hasPersistedStoredSession.value = rememberAuth
    canUseStoredSessionForCurrentLogin.value = rememberAuth
  }

  function disableStoredSessionForCurrentLogin(): void {
    canUseStoredSessionForCurrentLogin.value = false
  }

  function clearStoredSessionFlags(): void {
    hasPersistedStoredSession.value = false
    canUseStoredSessionForCurrentLogin.value = false
  }

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
