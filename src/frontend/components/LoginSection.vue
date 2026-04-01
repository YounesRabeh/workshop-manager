<!--
  Overview: Login and advanced-auth settings interface for unauthenticated users.
  Responsibility: Renders credential/Steam Guard flows, stored-session controls, 
  and Web API advanced options while emitting normalized auth interaction events.
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type {
  AdvancedSettingsState,
  AuthIssue,
  AuthIssueTone,
  LoginFormState,
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
  steamGuardCode: string
  isStoredSessionLoginAttempt: boolean
  canClearStoredSession: boolean
  isAdvancedOptionsOpen: boolean
  advancedSettings: AdvancedSettingsState
  isWebApiKeyPeek: boolean
  installLogPath: string
}>()

const emit = defineEmits<{
  (e: 'submit-login'): void
  (e: 'set-password-peek', value: boolean): void
  (e: 'submit-guard-code'): void
  (e: 'update-steam-guard-code', value: string): void
  (e: 'toggle-advanced-options'): void
  (e: 'update-web-api-key', value: string): void
  (e: 'update-steamcmd-manual-path', value: string): void
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

function onWebApiKeyInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-web-api-key', target?.value ?? '')
}

function onSteamCmdManualPathInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-steamcmd-manual-path', target?.value ?? '')
}

const canSubmitLogin = computed(() => {
  const hasUsername = props.loginForm.username.trim().length > 0
  const hasPassword = props.loginForm.password.trim().length > 0
  const canUseSavedSession = props.canClearStoredSession && props.loginForm.rememberAuth && !hasPassword
  return !props.isLoginSubmitting && hasUsername && (hasPassword || canUseSavedSession)
})

const submitLabel = computed(() => {
  if (props.isLoginSubmitting) {
    return 'Signing in...'
  }
  if (props.canClearStoredSession && props.loginForm.rememberAuth && props.loginForm.password.trim().length === 0) {
    return 'Sign in with saved session'
  }
  return 'Sign in'
})

const passwordPlaceholder = computed(() => {
  if (props.canClearStoredSession && props.loginForm.rememberAuth && props.loginForm.password.trim().length === 0) {
    return '********'
  }
  return ''
})

const missingStoredSessionHint = computed(() => {
  if (!props.loginForm.rememberAuth || props.canClearStoredSession) {
    return ''
  }
  return 'No saved session found yet. Enter password to sign in and create one.'
})

const canSaveAdvancedSettings = computed(() => {
  return !props.advancedSettings.isSaving
})

const canClearSteamCmdPath = computed(() => {
  return !props.advancedSettings.isSaving && props.advancedSettings.steamCmdManualPath.trim().length > 0
})

const shouldShowInstallLogButton = computed(() => {
  return /install error/i.test(props.statusMessage) || props.installLogPath.trim().length > 0
})

const steamCmdStatusLabel = computed(() => {
  if (props.advancedSettings.steamCmdSource === 'manual') {
    return 'Manual Path'
  }
  if (props.advancedSettings.steamCmdSource === 'auto') {
    return 'App Install'
  }
  return 'Needs Setup'
})

const steamCmdStatusClass = computed(() => {
  if (props.advancedSettings.steamCmdSource === 'manual') {
    return 'advanced-badge-success'
  }
  if (props.advancedSettings.steamCmdSource === 'auto') {
    return 'advanced-badge-info'
  }
  return 'advanced-badge-warning'
})

const webApiStatusLabel = computed(() => {
  if (props.advancedSettings.hasWebApiKey) {
    return 'Saved'
  }
  if (!props.advancedSettings.secureStorageAvailable) {
    return 'Unavailable'
  }
  return 'Optional'
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

const steamCmdHint = computed(() => {
  if (props.advancedSettings.steamCmdSource === 'manual') {
    return 'Using a custom executable path saved for this device.'
  }
  if (props.advancedSettings.steamCmdSource === 'auto') {
    return 'Using the app-managed SteamCMD install.'
  }
  return 'Auto-install is available on Linux and Windows. On macOS, set this manually.'
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
  const canUseSavedSession = props.canClearStoredSession && props.loginForm.rememberAuth && !hasPassword

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
      props.canClearStoredSession &&
      props.loginForm.rememberAuth &&
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
    <div class="login-panel">
      <header>
        <p class="login-kicker text-[16px] font-extrabold tracking-[0.18em] text-sky-500">WORKSHOP MANAGER</p>
        <h1 class="text-4xl font-extrabold tracking-tight text-slate-900">Sign in</h1>
        <p class="mt-2 text-sm text-slate-600">Use your Steam account to unlock mod management.</p>
        <p v-if="statusMessage" class="login-status">{{ statusMessage }}</p>
        <button
          v-if="shouldShowInstallLogButton"
          type="button"
          class="login-peek mt-3 rounded border border-slate-300 px-3 py-2 text-xs font-semibold"
          @click="emit('open-install-log')"
        >
          Open Log File
        </button>
      </header>

      <form class="mt-5" @submit.prevent="emit('submit-login')">
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500">Account name</label>
        <input
          ref="usernameInputRef"
          v-model="loginForm.username"
          class="login-input mt-1 w-full rounded border border-slate-300 px-3 py-2"
          @keydown="onLoginControlArrowKey($event, 0)"
          @input="onCredentialInput"
        />

        <label class="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            ref="passwordInputRef"
            v-model="loginForm.password"
            :type="isPasswordPeek ? 'text' : 'password'"
            :placeholder="passwordPlaceholder"
            autocomplete="current-password"
            class="login-input w-full rounded border border-slate-300 px-3 py-2"
            @keydown="onLoginControlArrowKey($event, 1)"
            @input="onCredentialInput"
          />
          <button
            type="button"
            class="login-peek rounded border border-slate-300 px-3 py-2 text-xs font-semibold"
            @mouseenter="emit('set-password-peek', true)"
            @mouseleave="emit('set-password-peek', false)"
            @focus="emit('set-password-peek', true)"
            @blur="emit('set-password-peek', false)"
          >
            Show
          </button>
        </div>

        <label class="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            ref="rememberUsernameRef"
            v-model="loginForm.rememberUsername"
            type="checkbox"
            @keydown="onLoginControlArrowKey($event, 2)"
          />
          Remember account name
        </label>

        <label class="mt-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            ref="rememberAuthRef"
            v-model="loginForm.rememberAuth"
            type="checkbox"
            @keydown="onLoginControlArrowKey($event, 3)"
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
          class="login-peek mt-2 w-full rounded border border-slate-300 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isLoginSubmitting || !canClearStoredSession"
          @click="emit('clear-stored-session')"
        >
          Clear saved session
        </button>
        <button
          type="button"
          class="login-peek mt-3 w-full rounded border border-slate-300 px-3 py-2 text-xs font-semibold"
          @click="emit('toggle-advanced-options')"
        >
          {{ isAdvancedOptionsOpen ? 'Hide Advanced Options' : 'Advanced Developer Options' }}
        </button>

        <div v-if="isAdvancedOptionsOpen" class="advanced-panel mt-3">
          <div class="advanced-header">
            <div>
              <p class="advanced-kicker">Advanced Developer Options</p>
              <p class="advanced-summary">Configure a custom SteamCMD path and optional Steam Web API access for this device.</p>
            </div>
          </div>

          <div class="advanced-card-grid mt-4">
            <section class="advanced-card">
              <div class="advanced-card-header">
                <div>
                  <h3 class="advanced-card-title">SteamCMD Executable</h3>
                  <p class="advanced-card-copy">{{ steamCmdHint }}</p>
                </div>
                <span class="advanced-badge" :class="steamCmdStatusClass">{{ steamCmdStatusLabel }}</span>
              </div>

              <p v-if="advancedSettings.steamCmdManualPath.trim()" class="advanced-path-preview">
                {{ advancedSettings.steamCmdManualPath }}
              </p>
              <p v-else class="advanced-path-placeholder">No manual path saved. The app will use its managed install when available.</p>

              <label class="advanced-label mt-4">SteamCMD Executable Path</label>
              <div class="advanced-path-row">
                <input
                  :value="advancedSettings.steamCmdManualPath"
                  placeholder="Path to executable"
                  autocomplete="off"
                  class="login-input advanced-input"
                  @input="onSteamCmdManualPathInput"
                />
              </div>
              <div class="advanced-path-actions">
                <button
                  type="button"
                  class="login-peek advanced-inline-button"
                  @click="emit('pick-steamcmd-manual-path')"
                >
                  Browse
                </button>
                <button
                  type="button"
                  class="login-peek advanced-inline-button disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="!canClearSteamCmdPath"
                  @click="emit('update-steamcmd-manual-path', '')"
                >
                  Clear Path
                </button>
              </div>
            </section>

            <section class="advanced-card">
              <div class="advanced-card-header">
                <div>
                  <h3 class="advanced-card-title">Steam Web API Key</h3>
                  <p class="advanced-card-copy">Save a Steam Web API key for API-backed lookups and store it securely when supported.</p>
                </div>
                <span class="advanced-badge" :class="webApiStatusClass">{{ webApiStatusLabel }}</span>
              </div>

              <label class="advanced-label mt-4">Steam Web API Key</label>
              <div class="advanced-key-row">
                <input
                  :type="isWebApiKeyPeek ? 'text' : 'password'"
                  :value="advancedSettings.webApiKey"
                  :placeholder="advancedSettings.hasWebApiKey ? 'Saved securely (enter new key to replace)' : 'Paste key...'"
                  autocomplete="off"
                  class="login-input advanced-input"
                  @input="onWebApiKeyInput"
                />
                <button
                  type="button"
                  class="login-peek advanced-inline-button"
                  @mouseenter="emit('set-web-api-key-peek', true)"
                  @mouseleave="emit('set-web-api-key-peek', false)"
                  @focus="emit('set-web-api-key-peek', true)"
                  @blur="emit('set-web-api-key-peek', false)"
                >
                  Show
                </button>
              </div>

              <p class="advanced-meta">
                {{
                  advancedSettings.secureStorageAvailable
                    ? 'Key is stored encrypted using OS secure storage.'
                    : 'Secure storage is not available. Key saving is disabled on this device.'
                }}
              </p>
              <p v-if="advancedSettings.hasWebApiKey" class="advanced-meta advanced-meta-success">Saved key detected and ready to use.</p>
            </section>
          </div>

          <p v-if="advancedSettings.statusMessage" class="advanced-feedback mt-4">{{ advancedSettings.statusMessage }}</p>

          <div class="advanced-actions mt-4">
            <button
              type="button"
              class="login-submit advanced-primary-action text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!canSaveAdvancedSettings || !advancedSettings.secureStorageAvailable"
              @click="emit('save-advanced-settings')"
            >
              {{ advancedSettings.isSaving ? 'Saving...' : 'Save Advanced Options' }}
            </button>
            <button
              type="button"
              class="login-peek advanced-secondary-action text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="advancedSettings.isSaving || !advancedSettings.hasWebApiKey"
              @click="emit('clear-web-api-key')"
            >
              Clear Saved Key
            </button>
          </div>
        </div>

        <button
          ref="submitButtonRef"
          type="submit"
          class="login-submit mt-5 w-full rounded px-3 py-2 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSubmitLogin"
          @keydown="onLoginControlArrowKey($event, 4)"
        >
          {{ submitLabel }}
        </button>
        <div class="mt-3 flex justify-center">
          <button
            type="button"
            class="login-quit w-[168px] rounded border border-slate-300 px-3 py-2 text-xs font-semibold"
            @click="emit('quit-app')"
          >
            Quit
          </button>
        </div>
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

      <div
        v-if="isLoginSubmitting || steamGuardPromptType !== 'none'"
        class="login-guard mt-4 px-3 py-3"
        :class="steamGuardPromptType === 'steam_guard_approved' ? 'login-guard-success' : ''"
      >
        <p class="text-sm font-medium" :class="steamGuardPromptType === 'steam_guard_approved' ? 'login-guard-title-success' : 'text-amber-800'">Steam Guard</p>
        <p v-if="steamGuardPromptType === 'waiting'" class="mt-1 text-sm text-amber-900">
          {{
            isStoredSessionLoginAttempt
              ? 'Checking saved Steam session. Steam Guard may be required to continue.'
              : 'Waiting for Steam login challenge...'
          }}
        </p>
        <p v-else-if="steamGuardPromptType === 'steam_guard_mobile'" class="mt-1 text-sm text-amber-900">
          {{
            isStoredSessionLoginAttempt
              ? 'Saved session requires approval in the Steam mobile app.'
              : 'Approve this sign in in the Steam mobile app.'
          }}
        </p>
        <form v-else-if="steamGuardPromptType === 'steam_guard_code'" class="mt-2" @submit.prevent="emit('submit-guard-code')">
          <input :value="steamGuardCode" class="login-input w-full rounded border border-amber-300 px-2 py-1" @input="onSteamGuardInput" />
          <button type="submit" class="login-submit mt-2 w-full rounded px-2 py-2 text-sm font-semibold text-white">Submit code</button>
        </form>
        <p v-else-if="steamGuardPromptType === 'steam_guard_approved'" class="mt-1 text-sm login-guard-text-success">
          Approval received. Finalizing sign in...
        </p>
        <p v-else class="mt-1 text-sm text-amber-900">Waiting for Steam response...</p>
      </div>
    </div>

    <p class="login-disclaimer">* Not an official Steam product • v{{ appVersion || 'dev' }}</p>
  </section>
</template>
