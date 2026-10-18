/**
 * Overview: Manages signed-in Steam profile summary state for the renderer shell.
 * Responsibility: Loads and clears persona/avatar information used by account UI affordances.
 */
import { ref } from 'vue'
import { logError, normalizeError as normalizeSharedError } from '@shared/api-error-utils'

/** Provides current Steam profile state and its refresh/clear actions. */
export function useSteamProfile() {
  const accountPersonaName = ref<string>('')
  const accountProfileImageUrl = ref<string | null>(null)

  /** Fetches the signed-in Steam profile and stores the latest result. */
  async function refreshCurrentProfile(): Promise<void> {
    try {
      const profile = await window.workshop.getCurrentProfile()
      accountPersonaName.value = profile.personaName?.trim() || ''
      accountProfileImageUrl.value = profile.avatarUrl?.trim() || null
    } catch (error) {
      logError('useAuthFlow::refreshCurrentProfile', normalizeSharedError(error))
      accountPersonaName.value = ''
      accountProfileImageUrl.value = null
    }
  }

  /** Removes the cached Steam profile after sign-out. */
  function clearProfile(): void {
    accountPersonaName.value = ''
    accountProfileImageUrl.value = null
  }

  return {
    accountPersonaName,
    accountProfileImageUrl,
    refreshCurrentProfile,
    clearProfile
  }
}
