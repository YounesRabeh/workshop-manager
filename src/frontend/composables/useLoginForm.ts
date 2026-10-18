/**
 * Overview: Owns login form state and remembered profile hydration for auth flows.
 * Responsibility: Exposes login form refs, field setters, and profile bootstrap sync
 * used by useAuthFlow to keep form and stored-session flags aligned.
 */
import { reactive, ref } from 'vue'
import type { PreferredAuthMode as SharedPreferredAuthMode } from '@shared/contracts'
import type { LoginFormState, PreferredAuthMode } from '../types/ui'

interface UseLoginFormOptions {
  applyRememberedProfileState: (hasStoredAuth: boolean) => void
  onPreferredAuthModeLoaded: (mode: PreferredAuthMode) => void
  normalizePreferredAuthMode: (mode: SharedPreferredAuthMode | undefined) => PreferredAuthMode
}

/** Provides reactive login fields, remember preferences, and input actions. */
export function useLoginForm(options: UseLoginFormOptions) {
  const loginForm = reactive<LoginFormState>({
    username: '',
    password: '',
    rememberUsername: true,
    rememberAuth: false
  })

  const isPasswordPeek = ref(false)

  /** Stores the username entered for the next login attempt. */
  function setLoginUsername(value: string): void {
    loginForm.username = value
  }

  /** Stores the password entered for the next login attempt. */
  function setLoginPassword(value: string): void {
    loginForm.password = value
  }

  /** Sets whether the username should be restored on the next launch. */
  function setRememberUsername(value: boolean): void {
    loginForm.rememberUsername = value || loginForm.rememberAuth
  }

  /** Sets whether reusable Steam authentication should be stored. */
  function setRememberAuth(value: boolean): void {
    loginForm.rememberAuth = value
    if (value) {
      loginForm.rememberUsername = true
    }
  }

  /** Shows or masks the password field in the login form. */
  function setPasswordPeek(value: boolean): void {
    isPasswordPeek.value = value
  }

  /** Loads the saved username and authentication preference into the form. */
  async function refreshRememberedLoginState(): Promise<void> {
    const payload = await window.workshop.getProfiles()
    const rememberedUsername = payload.rememberedUsername?.trim() ?? ''
    loginForm.username = rememberedUsername
    loginForm.rememberUsername = rememberedUsername.length > 0
    options.onPreferredAuthModeLoaded(options.normalizePreferredAuthMode(payload.preferredAuthMode))
    const hasStoredAuth = payload.hasStoredAuth === true
    loginForm.rememberAuth = payload.rememberAuth === true
    options.applyRememberedProfileState(hasStoredAuth)
    if (loginForm.rememberAuth) {
      loginForm.rememberUsername = true
    }
  }

  return {
    loginForm,
    isPasswordPeek,
    setLoginUsername,
    setLoginPassword,
    setRememberUsername,
    setRememberAuth,
    setPasswordPeek,
    refreshRememberedLoginState
  }
}
