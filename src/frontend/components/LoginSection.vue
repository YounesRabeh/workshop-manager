<!--
  Overview: Login and advanced-auth settings interface for unauthenticated users.
  Responsibility: Renders credential/Steam Guard flows, stored-session controls, 
  and Web API advanced options while emitting normalized auth interaction events.
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import LoginCredentialsSection from './login/LoginCredentialsSection.vue'
import LoginSecuritySection from './login/LoginSecuritySection.vue'
import LoginSessionSection from './login/LoginSessionSection.vue'
import AdvancedSettingsPanel from './settings/AdvancedSettingsPanel.vue'
import type {
  ActiveChallengeMode,
  AdvancedSettingsState,
  AuthIssue,
  AuthIssueTone,
  LoginFormState,
  PreferredAuthMode,
  SteamGuardPromptType
} from '../types/ui'
import { moveFocusWithVerticalArrows, toggleCheckboxOrRadioOnEnter } from '../events/keyboard-events'

const props = defineProps<{
  statusMessage: string
  loginHeaderStatusMessage: string
  appVersion: string
  isLoginSubmitting: boolean
  loginForm: LoginFormState
  isPasswordPeek: boolean
  authIssue: AuthIssue | null
  steamGuardPromptType: SteamGuardPromptType
  preferredAuthMode: PreferredAuthMode
  activeChallengeMode: ActiveChallengeMode
  steamGuardCode: string
  isStoredSessionLoginAttempt: boolean
  canClearStoredSession: boolean
  canUseStoredSessionForLogin: boolean
  isAdvancedOptionsOpen: boolean
  advancedSettings: AdvancedSettingsState
  isWebApiKeyPeek: boolean
  installLogPath: string
  timeoutScope?: 'all' | 'login_only'
}>()

const emit = defineEmits<{
  (e: 'submit-login'): void
  (e: 'update-username', value: string): void
  (e: 'update-password', value: string): void
  (e: 'update-remember-username', value: boolean): void
  (e: 'update-remember-auth', value: boolean): void
  (e: 'update-preferred-auth-mode', value: PreferredAuthMode): void
  (e: 'set-password-peek', value: boolean): void
  (e: 'submit-guard-code'): void
  (e: 'update-steam-guard-code', value: string): void
  (e: 'toggle-advanced-options'): void
  (e: 'update-web-api-key', value: string): void
  (e: 'update-steamcmd-manual-path', value: string): void
  (e: 'update-login-timeout-ms', value: string): void
  (e: 'update-stored-session-timeout-ms', value: string): void
  (e: 'update-workshop-timeout-ms', value: string): void
  (e: 'pick-steamcmd-manual-path'): void
  (e: 'set-web-api-key-peek', value: boolean): void
  (e: 'save-advanced-settings'): void
  (e: 'clear-web-api-key'): void
  (e: 'open-install-log'): void
  (e: 'clear-stored-session'): void
  (e: 'quit-app'): void
}>()

function authIssueClasses(tone: AuthIssueTone): string {
  if (tone === 'danger') {
    return 'login-note-danger'
  }
  if (tone === 'warning') {
    return 'login-note-warning'
  }
  return 'login-note-info'
}

const isApiSectionExpanded = ref(false)

function toggleApiSection(): void {
  isApiSectionExpanded.value = !isApiSectionExpanded.value
}

const canSubmitLogin = computed(() => {
  const hasUsername = props.loginForm.username.trim().length > 0
  const hasPassword = props.loginForm.password.trim().length > 0
  const canUseSavedSession = props.canUseStoredSessionForLogin && !hasPassword
  return !props.isLoginSubmitting && hasUsername && (hasPassword || canUseSavedSession)
})

const isWebApiKeySaveBlocked = computed(() => {
  return !props.advancedSettings.secureStorageAvailable && props.advancedSettings.webApiKey.trim().length > 0
})

const canSaveWebApiKey = computed(() => {
  return (
    !props.advancedSettings.isSaving &&
    !isWebApiKeySaveBlocked.value &&
    props.advancedSettings.webApiKey.trim().length > 0
  )
})

const canClearSavedWebApiKey = computed(() => {
  return !props.advancedSettings.isSaving && props.advancedSettings.hasWebApiKey
})

const webApiStatusLabel = computed(() => {
  if (props.advancedSettings.hasWebApiKey) {
    return 'Saved'
  }
  if (!props.advancedSettings.secureStorageAvailable) {
    return 'Unavailable'
  }
  return '(optional)'
})

const webApiStatusClass = computed(() => {
  if (props.advancedSettings.hasWebApiKey) {
    return 'advanced-badge-success'
  }
  if (!props.advancedSettings.secureStorageAvailable) {
    return 'advanced-badge-warning'
  }
  return 'advanced-badge-muted'
})

const webApiStorageHint = computed(() => {
  if (props.advancedSettings.secureStorageAvailable) {
    return 'Saved keys are encrypted using OS secure storage.'
  }
  return 'Secure storage is unavailable on this system. Leave the key empty to continue without non-public item access.'
})

const apiSectionToggleLabel = computed(() => {
  return isApiSectionExpanded.value ? 'Hide API Options' : 'Show API Options'
})

const submitLabel = computed(() => {
  if (props.isLoginSubmitting) {
    return 'Signing in...'
  }
  if (props.canUseStoredSessionForLogin && props.loginForm.password.trim().length === 0) {
    return 'Sign in with saved session'
  }
  return 'Sign in'
})

const passwordPlaceholder = computed(() => {
  if (props.canUseStoredSessionForLogin && props.loginForm.password.trim().length === 0) {
    return '********'
  }
  return ''
})

const missingStoredSessionHint = computed(() => {
  if (!props.loginForm.rememberAuth || props.canUseStoredSessionForLogin || props.canClearStoredSession) {
    return ''
  }
  return 'No saved session found yet. Enter password to sign in and create one.'
})

const shouldShowInstallLogButton = computed(() => {
  return /install error/i.test(props.statusMessage) || props.installLogPath.trim().length > 0
})

const isHeaderStatusError = computed(() => {
  return /not found/i.test(props.loginHeaderStatusMessage)
})

const statusIcon = computed(() => {
  return isHeaderStatusError.value ? '✕' : '✓'
})

const statusClass = computed(() => {
  return isHeaderStatusError.value ? 'login-status-error' : 'login-status-ok'
})

const isOtpChallengeActive = computed(() => props.activeChallengeMode === 'otp')
const isMobileChallengeActive = computed(() => props.activeChallengeMode === 'steam_guard_mobile')
const isStoredSessionFetching = computed(() => {
  const isPendingState = props.steamGuardPromptType === 'waiting' || props.isLoginSubmitting
  return (
    props.isStoredSessionLoginAttempt &&
    isPendingState &&
    !isOtpChallengeActive.value &&
    !isMobileChallengeActive.value
  )
})
const shouldShowOtpEntry = computed(() => {
  const preferredOtpPending =
    props.preferredAuthMode === 'otp' &&
    props.isLoginSubmitting &&
    !props.isStoredSessionLoginAttempt &&
    props.steamGuardPromptType !== 'steam_guard_mobile' &&
    props.steamGuardPromptType !== 'steam_guard_approved'
  return isOtpChallengeActive.value || preferredOtpPending
})
const canSubmitOtpCode = computed(() => {
  return shouldShowOtpEntry.value && props.steamGuardCode.trim().length > 0
})

const otpSubmitLabel = computed(() => {
  if (!isOtpChallengeActive.value && props.isLoginSubmitting) {
    return 'Save OTP / Email code'
  }
  return 'Submit OTP / Email code'
})

const securityStatusTitle = computed(() => {
  if (props.steamGuardPromptType === 'steam_guard_approved') {
    return 'Auth received'
  }
  if (isOtpChallengeActive.value) {
    return 'OTP / Email code required'
  }
  if (isMobileChallengeActive.value) {
    return 'Signing in ...'
  }
  if (isStoredSessionFetching.value) {
    return 'Fetching saved session'
  }
  if (props.steamGuardPromptType === 'waiting' || props.isLoginSubmitting) {
    return 'Waiting for Steam verification'
  }
  return props.preferredAuthMode === 'steam_guard_mobile' ? 'Preferred: Steam app approval' : 'Preferred: OTP / Email code'
})

const securityStatusCallout = computed(() => {
  if (props.steamGuardPromptType === 'steam_guard_approved' || isMobileChallengeActive.value) {
    return 'AUTH APPROVED'
  }
  if (
    !isStoredSessionFetching.value &&
    (props.steamGuardPromptType === 'waiting' || props.isLoginSubmitting) &&
    props.preferredAuthMode === 'steam_guard_mobile'
  ) {
    return 'CHECK YOUR STEAM GUARD APP'
  }
  return ''
})

const securityStatusCopy = computed(() => {
  if (props.steamGuardPromptType === 'steam_guard_approved') {
    return 'Steam accepted your verification. Finalizing sign-in now.'
  }
  if (isOtpChallengeActive.value) {
    return 'Enter the OTP / Email code sent by Steam to continue.'
  }
  if (isMobileChallengeActive.value) {
    return 'Auth request approved. Finalizing sign-in now.'
  }
  if (isStoredSessionFetching.value) {
    return 'Fetching saved Steam session. Steam Guard may be required if Steam requests verification.'
  }
  if (props.steamGuardPromptType === 'waiting' || props.isLoginSubmitting) {
    if (props.preferredAuthMode === 'otp') {
      return 'Sign-in request sent. You can enter OTP / Email code now and we will submit it when Steam requests it.'
    }
    return 'Steam auth request sent.'
  }
  return 'Choose your preferred method below. Steam might still request the other method for this sign-in.'
})

const securityCardClass = computed(() => {
  if (props.steamGuardPromptType === 'steam_guard_approved') {
    return 'login-security-card-success'
  }
  if (isMobileChallengeActive.value) {
    return 'login-security-card-success'
  }
  if (isStoredSessionFetching.value) {
    return 'login-security-card-neutral'
  }
  if (isOtpChallengeActive.value || props.steamGuardPromptType === 'waiting') {
    return 'login-security-card-warning'
  }
  return 'login-security-card-neutral'
})

const loginFormRef = ref<HTMLFormElement | null>(null)
const hasUserEditedCredentials = ref(false)
const hasAppliedDefaultFocus = ref(false)
const lastDefaultFocusTarget = ref<number | null>(null)

function getLoginControl(index: number): HTMLElement | null {
  const orderedControlSelectors = [
    '[data-login-control="username"]',
    '[data-login-control="password"]',
    '[data-login-control="remember-username"]',
    '[data-login-control="remember-auth"]',
    '[data-login-control="submit"]'
  ]
  const selector = orderedControlSelectors[index]
  if (!selector) {
    return null
  }
  return loginFormRef.value?.querySelector(selector) ?? null
}

function focusLoginControl(index: number): void {
  getLoginControl(index)?.focus()
}

function onLoginControlArrowKey(event: KeyboardEvent, index: number): void {
  if (toggleCheckboxOrRadioOnEnter(event)) {
    return
  }
  moveFocusWithVerticalArrows(event, index, getLoginControl, 4)
}

function resolveDefaultFocusTarget(): number {
  const hasUsername = props.loginForm.username.trim().length > 0
  const hasPassword = props.loginForm.password.trim().length > 0
  const canUseSavedSession = props.canUseStoredSessionForLogin && !hasPassword

  if (!hasUsername) {
    return 0
  }

  if (!(hasPassword || canUseSavedSession)) {
    return 1
  }

  return 4
}

function applyDefaultFocus(): void {
  if (props.isLoginSubmitting) {
    return
  }
  const target = resolveDefaultFocusTarget()
  focusLoginControl(target)
  hasAppliedDefaultFocus.value = true
  lastDefaultFocusTarget.value = target
}

function onCredentialInput(): void {
  hasUserEditedCredentials.value = true
}

function onUsernameInput(value: string): void {
  onCredentialInput()
  emit('update-username', value)
}

function onPasswordInput(value: string): void {
  onCredentialInput()
  emit('update-password', value)
}

function onRememberUsernameChange(value: boolean): void {
  onCredentialInput()
  emit('update-remember-username', value)
}

function onRememberAuthChange(value: boolean): void {
  onCredentialInput()
  emit('update-remember-auth', value)
}

onMounted(() => {
  void nextTick(() => {
    applyDefaultFocus()
  })
})

watch(
  () => [
    props.loginForm.username,
    props.loginForm.password,
    props.loginForm.rememberAuth,
    props.canUseStoredSessionForLogin,
    props.canClearStoredSession,
    props.isLoginSubmitting
  ],
  () => {
    if (!hasAppliedDefaultFocus.value) {
      applyDefaultFocus()
      return
    }

    // If cached credentials hydrate after mount, move focus from fields to Sign in once.
    const shouldAutoFocusSubmitForSavedSession =
      props.canUseStoredSessionForLogin &&
      props.loginForm.password.trim().length === 0

    if (
      !hasUserEditedCredentials.value &&
      lastDefaultFocusTarget.value !== 4 &&
      resolveDefaultFocusTarget() === 4 &&
      shouldAutoFocusSubmitForSavedSession &&
      !props.isLoginSubmitting
    ) {
      applyDefaultFocus()
    }
  },
  { flush: 'post' }
)
</script>

<template>
  <section class="fade-in login-shell">
    <div class="login-layout">
      <aside class="login-hero">
        <div class="login-hero-inner">
          <p class="login-kicker">WORKSHOP MANAGER</p>
          <h1 class="login-hero-title">Your Workshop Command Center</h1>
          <p class="login-hero-copy">Manage all your Steam workshop items from one focused workspace.</p>
        </div>
        <p class="login-disclaimer">* Not an official Steam product • v{{ appVersion || 'dev' }}</p>
      </aside>

      <div class="login-panel">
        <header class="login-header">
          <h2 class="login-title">Sign in</h2>
          <p class="login-subtitle">Use your Steam account to unlock mod management.</p>
          <p v-if="loginHeaderStatusMessage" class="login-status" :class="statusClass">
            <span>{{ loginHeaderStatusMessage }}</span>
            <span class="login-status-icon" aria-hidden="true">{{ statusIcon }}</span>
          </p>
          <button
            v-if="shouldShowInstallLogButton"
            type="button"
            class="login-peek mt-3 rounded px-3 py-2 text-xs font-semibold"
            @click="emit('open-install-log')"
          >
            Open Log File
          </button>
        </header>

        <form ref="loginFormRef" class="login-form mt-5" @submit.prevent="emit('submit-login')">
          <div class="login-primary-grid">
            <LoginCredentialsSection
              :login-form="loginForm"
              :is-password-peek="isPasswordPeek"
              :password-placeholder="passwordPlaceholder"
              :advanced-settings="advancedSettings"
              :is-web-api-key-peek="isWebApiKeyPeek"
              :is-api-section-expanded="isApiSectionExpanded"
              :api-section-toggle-label="apiSectionToggleLabel"
              :web-api-status-label="webApiStatusLabel"
              :web-api-status-class="webApiStatusClass"
              :web-api-storage-hint="webApiStorageHint"
              :is-web-api-key-save-blocked="isWebApiKeySaveBlocked"
              :can-save-web-api-key="canSaveWebApiKey"
              :can-clear-saved-web-api-key="canClearSavedWebApiKey"
              :on-control-arrow-key="onLoginControlArrowKey"
              @update-username="onUsernameInput"
              @update-password="onPasswordInput"
              @set-password-peek="emit('set-password-peek', $event)"
              @update-web-api-key="emit('update-web-api-key', $event)"
              @toggle-api-section="toggleApiSection"
              @set-web-api-key-peek="emit('set-web-api-key-peek', $event)"
              @save-advanced-settings="emit('save-advanced-settings')"
              @clear-web-api-key="emit('clear-web-api-key')"
            />

            <LoginSecuritySection
              :preferred-auth-mode="preferredAuthMode"
              :security-status-title="securityStatusTitle"
              :security-status-copy="securityStatusCopy"
              :security-status-callout="securityStatusCallout"
              :security-card-class="securityCardClass"
              :should-show-otp-entry="shouldShowOtpEntry"
              :steam-guard-code="steamGuardCode"
              :can-submit-otp-code="canSubmitOtpCode"
              :otp-submit-label="otpSubmitLabel"
              @update-preferred-auth-mode="emit('update-preferred-auth-mode', $event)"
              @update-steam-guard-code="emit('update-steam-guard-code', $event)"
              @submit-guard-code="emit('submit-guard-code')"
            />
          </div>

          <div class="login-secondary-grid">
            <LoginSessionSection
              :login-form="loginForm"
              :is-login-submitting="isLoginSubmitting"
              :can-clear-stored-session="canClearStoredSession"
              :missing-stored-session-hint="missingStoredSessionHint"
              :on-control-arrow-key="onLoginControlArrowKey"
              @update-remember-username="onRememberUsernameChange"
              @update-remember-auth="onRememberAuthChange"
              @clear-stored-session="emit('clear-stored-session')"
            />

            <section class="login-block login-actions-block">
              <button
                data-login-control="submit"
                type="submit"
                class="login-submit w-full rounded px-3 py-2 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!canSubmitLogin"
                @keydown="onLoginControlArrowKey($event, 4)"
              >
                {{ submitLabel }}
              </button>

              <button
                type="button"
                class="login-peek mt-3 w-full rounded px-3 py-2 text-xs font-semibold"
                @click="emit('toggle-advanced-options')"
              >
                {{ isAdvancedOptionsOpen ? 'Hide Advanced Options' : 'Advanced Developer Options' }}
              </button>

              <button
                type="button"
                class="login-quit mt-3 w-full rounded px-3 py-2 text-xs font-semibold"
                @click="emit('quit-app')"
              >
                Quit
              </button>
            </section>
          </div>

          <AdvancedSettingsPanel
            v-if="isAdvancedOptionsOpen"
            class="mt-3"
            :advanced-settings="advancedSettings"
            :is-web-api-key-peek="isWebApiKeyPeek"
            :show-web-api-section="false"
            :timeout-scope="timeoutScope"
            web-api-section-placement="before_timeouts"
            layout-preset="api_timeout_path"
            summary="Advanced login setup: SteamCMD timeout and executable path."
            @update-web-api-key="emit('update-web-api-key', $event)"
            @update-steamcmd-manual-path="emit('update-steamcmd-manual-path', $event)"
            @update-login-timeout-ms="emit('update-login-timeout-ms', $event)"
            @update-stored-session-timeout-ms="emit('update-stored-session-timeout-ms', $event)"
            @update-workshop-timeout-ms="emit('update-workshop-timeout-ms', $event)"
            @pick-steamcmd-manual-path="emit('pick-steamcmd-manual-path')"
            @set-web-api-key-peek="emit('set-web-api-key-peek', $event)"
            @save-advanced-settings="emit('save-advanced-settings')"
            @clear-web-api-key="emit('clear-web-api-key')"
          />
        </form>

        <div
          v-if="authIssue"
          class="login-note mt-4 px-3 py-3 text-sm"
          :class="authIssueClasses(authIssue.tone)"
        >
          <p class="font-semibold">{{ authIssue.title }}</p>
          <p class="mt-1">{{ authIssue.detail }}</p>
          <p v-if="authIssue.hint" class="mt-1 text-xs opacity-90">{{ authIssue.hint }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
