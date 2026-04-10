<!--
  Overview: Login and advanced-auth settings interface for unauthenticated users.
  Responsibility: Renders credential/Steam Guard flows, stored-session controls, 
  and Web API advanced options while emitting normalized auth interaction events.
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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

function onSteamGuardInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-steam-guard-code', target?.value ?? '')
}

function onUsernameInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-username', target?.value ?? '')
  onCredentialInput()
}

function onPasswordInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-password', target?.value ?? '')
  onCredentialInput()
}

function onRememberUsernameChange(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-remember-username', target?.checked ?? false)
}

function onRememberAuthChange(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-remember-auth', target?.checked ?? false)
}

function onPreferredAuthModeChange(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-preferred-auth-mode', target?.value === 'steam_guard_mobile' ? 'steam_guard_mobile' : 'otp')
}

const canSubmitLogin = computed(() => {
  const hasUsername = props.loginForm.username.trim().length > 0
  const hasPassword = props.loginForm.password.trim().length > 0
  const canUseSavedSession = props.canUseStoredSessionForLogin && !hasPassword
  return !props.isLoginSubmitting && hasUsername && (hasPassword || canUseSavedSession)
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

const isOtpChallengeActive = computed(() => props.activeChallengeMode === 'otp')
const isMobileChallengeActive = computed(() => props.activeChallengeMode === 'steam_guard_mobile')
const shouldShowOtpEntry = computed(() => {
  const preferredOtpPending =
    props.preferredAuthMode === 'otp' &&
    props.isLoginSubmitting &&
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

const shouldShowMobileApprovalPrompt = computed(() => {
  const preferredMobilePending =
    props.preferredAuthMode === 'steam_guard_mobile' &&
    props.isLoginSubmitting &&
    props.steamGuardPromptType !== 'steam_guard_approved'
  return isMobileChallengeActive.value || preferredMobilePending
})

const securityStatusTitle = computed(() => {
  if (props.steamGuardPromptType === 'steam_guard_approved') {
    return 'Verification approved'
  }
  if (isOtpChallengeActive.value) {
    return 'OTP / Email code required'
  }
  if (isMobileChallengeActive.value) {
    return 'Steam app approval required'
  }
  if (props.steamGuardPromptType === 'waiting' || props.isLoginSubmitting) {
    return 'Waiting for Steam verification'
  }
  return props.preferredAuthMode === 'steam_guard_mobile' ? 'Preferred: Steam app approval' : 'Preferred: OTP / Email code'
})

const securityStatusCopy = computed(() => {
  if (props.steamGuardPromptType === 'steam_guard_approved') {
    return 'Steam accepted your verification. Finalizing sign-in now.'
  }
  if (isOtpChallengeActive.value) {
    return 'Enter the OTP / Email code sent by Steam to continue.'
  }
  if (isMobileChallengeActive.value) {
    return 'Open Steam on your phone and approve this sign-in request.'
  }
  if (props.steamGuardPromptType === 'waiting' || props.isLoginSubmitting) {
    if (props.preferredAuthMode === 'otp') {
      return 'Sign-in request sent. You can enter OTP / Email code now and we will submit it when Steam requests it.'
    }
    return 'Steam may request OTP / Email code or mobile approval based on account settings.'
  }
  return 'Choose your preferred method below. Steam might still request the other method for this sign-in.'
})

const securityCardClass = computed(() => {
  if (props.steamGuardPromptType === 'steam_guard_approved') {
    return 'login-security-card-success'
  }
  if (isOtpChallengeActive.value || isMobileChallengeActive.value || props.steamGuardPromptType === 'waiting') {
    return 'login-security-card-warning'
  }
  return 'login-security-card-neutral'
})

const usernameInputRef = ref<HTMLInputElement | null>(null)
const passwordInputRef = ref<HTMLInputElement | null>(null)
const rememberUsernameRef = ref<HTMLInputElement | null>(null)
const rememberAuthRef = ref<HTMLInputElement | null>(null)
const submitButtonRef = ref<HTMLButtonElement | null>(null)
const hasUserEditedCredentials = ref(false)
const hasAppliedDefaultFocus = ref(false)
const lastDefaultFocusTarget = ref<number | null>(null)

function getLoginControl(index: number): HTMLElement | null {
  const orderedControls: Array<HTMLElement | null> = [
    usernameInputRef.value,
    passwordInputRef.value,
    rememberUsernameRef.value,
    rememberAuthRef.value,
    submitButtonRef.value
  ]
  return orderedControls[index] ?? null
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
          <p class="login-hero-copy">Manage all your workshop items from one focused workspace.</p>
        </div>
        <p class="login-disclaimer">* Not an official Steam product • v{{ appVersion || 'dev' }}</p>
      </aside>

      <div class="login-panel">
        <header class="login-header">
          <h2 class="login-title">Sign in</h2>
          <p class="login-subtitle">Use your Steam account to unlock mod management.</p>
          <p v-if="statusMessage" class="login-status">{{ statusMessage }}</p>
          <button
            v-if="shouldShowInstallLogButton"
            type="button"
            class="login-peek mt-3 rounded px-3 py-2 text-xs font-semibold"
            @click="emit('open-install-log')"
          >
            Open Log File
          </button>
        </header>

        <form class="login-form mt-5" @submit.prevent="emit('submit-login')">
          <div class="login-primary-grid">
            <section class="login-block">
              <p class="login-block-title">Credentials</p>
              <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500">Account name</label>
              <input
                ref="usernameInputRef"
                :value="loginForm.username"
                class="login-input mt-1 w-full rounded px-3 py-2"
                @keydown="onLoginControlArrowKey($event, 0)"
                @input="onUsernameInput"
              />

              <label class="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
              <div class="mt-1 flex items-center gap-2">
                <input
                  ref="passwordInputRef"
                  :value="loginForm.password"
                  :type="isPasswordPeek ? 'text' : 'password'"
                  :placeholder="passwordPlaceholder"
                  autocomplete="current-password"
                  class="login-input w-full rounded px-3 py-2"
                  @keydown="onLoginControlArrowKey($event, 1)"
                  @input="onPasswordInput"
                />
                <button
                  type="button"
                  class="login-peek rounded px-3 py-2 text-xs font-semibold"
                  :aria-pressed="isPasswordPeek ? 'true' : 'false'"
                  @click="emit('set-password-peek', !isPasswordPeek)"
                >
                  {{ isPasswordPeek ? 'Hide' : 'Show' }}
                </button>
              </div>
            </section>

            <section class="login-block">
              <p class="login-block-title">Security</p>
              <p class="login-block-copy">Choose your preferred method. Steam may request a different one for this login.</p>
              <div class="login-mode-grid" role="radiogroup" aria-label="Preferred verification mode">
                <label class="login-mode-option">
                  <input
                    type="radio"
                    name="preferred-auth-mode"
                    value="otp"
                    :checked="preferredAuthMode === 'otp'"
                    @keydown="toggleCheckboxOrRadioOnEnter($event)"
                    @change="onPreferredAuthModeChange"
                  />
                  <span>
                    <strong>OTP / Email code</strong>
                    <small>Best for code-based verification prompts.</small>
                  </span>
                </label>
                <label class="login-mode-option">
                  <input
                    type="radio"
                    name="preferred-auth-mode"
                    value="steam_guard_mobile"
                    :checked="preferredAuthMode === 'steam_guard_mobile'"
                    @keydown="toggleCheckboxOrRadioOnEnter($event)"
                    @change="onPreferredAuthModeChange"
                  />
                  <span>
                    <strong>Steam app approval</strong>
                    <small>Best if you approve sign-ins in Steam Mobile.</small>
                  </span>
                </label>
              </div>

              <div class="login-security-card mt-3 px-3 py-3" :class="securityCardClass">
                <p class="text-sm font-semibold">{{ securityStatusTitle }}</p>
                <p class="mt-1 text-xs">{{ securityStatusCopy }}</p>

                <div v-if="shouldShowOtpEntry" class="mt-3">
                  <label class="block text-[11px] font-semibold uppercase tracking-[0.08em]">OTP / Email code</label>
                  <input
                    :value="steamGuardCode"
                    class="login-input mt-1 w-full rounded px-2 py-2"
                    @keydown.enter.prevent="emit('submit-guard-code')"
                    @input="onSteamGuardInput"
                  />
                  <button
                    type="button"
                    class="login-submit mt-2 w-full rounded px-2 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="!canSubmitOtpCode"
                    @click="emit('submit-guard-code')"
                  >
                    {{ otpSubmitLabel }}
                  </button>
                </div>
                <div v-else-if="shouldShowMobileApprovalPrompt" class="login-mobile-approval-note mt-3">
                  <strong>CHECK YOUR STEAM GUARD APP</strong>
                </div>
              </div>
            </section>
          </div>

          <div class="login-secondary-grid">
            <section class="login-block">
              <p class="login-block-title">Session</p>
              <label class="mt-1 flex items-center gap-2 text-sm text-slate-700">
                <input
                  ref="rememberUsernameRef"
                  :checked="loginForm.rememberUsername"
                  type="checkbox"
                  @keydown="onLoginControlArrowKey($event, 2)"
                  @change="onRememberUsernameChange"
                />
                Remember account name
              </label>

              <label class="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <input
                  ref="rememberAuthRef"
                  :checked="loginForm.rememberAuth"
                  type="checkbox"
                  @keydown="onLoginControlArrowKey($event, 3)"
                  @change="onRememberAuthChange"
                />
                Keep me signed in on this device
              </label>
              <p class="mt-1 text-[11px] text-slate-500">
                Uses SteamCMD cached login session. Password is never stored by this app.
              </p>
              <p v-if="missingStoredSessionHint" class="mt-1 text-[11px] text-slate-500">
                {{ missingStoredSessionHint }}
              </p>
              <button
                type="button"
                class="login-peek mt-2 w-full rounded px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="isLoginSubmitting || !canClearStoredSession"
                @click="emit('clear-stored-session')"
              >
                Clear saved session
              </button>
            </section>

            <section class="login-block login-actions-block">
              <button
                ref="submitButtonRef"
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
            :timeout-scope="timeoutScope"
            web-api-section-placement="before_timeouts"
            layout-preset="api_timeout_path"
            summary="Advanced login setup: Web API key, SteamCMD timeouts, and executable path."
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
