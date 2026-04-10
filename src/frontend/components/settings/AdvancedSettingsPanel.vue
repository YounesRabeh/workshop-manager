<!--
  Overview: Shared advanced settings form for SteamCMD, Web API, and runtime timeout configuration.
  Responsibility: Renders editable advanced settings fields and emits normalized updates without owning persistence itself.
-->
<script setup lang="ts">
import { computed } from 'vue'
import {
  DEFAULT_STEAMCMD_TIMEOUT_SETTINGS,
  STEAMCMD_TIMEOUT_DISABLED_VALUE,
  STEAMCMD_TIMEOUT_LIMITS
} from '@shared/runtime-settings'
import type { AdvancedSettingsState } from '../../types/ui'

const props = withDefaults(defineProps<{
  advancedSettings: AdvancedSettingsState
  isWebApiKeyPeek: boolean
  kicker?: string
  summary?: string
  saveLabel?: string
  timeoutScope?: 'all' | 'login_only'
  showSteamCmdSection?: boolean
  showWebApiSection?: boolean
  webApiSectionPlacement?: 'before_timeouts' | 'after_timeouts'
  layoutPreset?: 'default' | 'api_timeout_path'
}>(), {
  kicker: 'Advanced Developer Options',
  summary: 'Configure a custom SteamCMD path, optional Steam Web API access, and SteamCMD timeout behavior for this device.',
  saveLabel: 'Save Advanced Options',
  timeoutScope: 'all',
  showSteamCmdSection: true,
  showWebApiSection: true,
  webApiSectionPlacement: 'before_timeouts',
  layoutPreset: 'default'
})

const emit = defineEmits<{
  (e: 'update-web-api-key', value: string): void
  (e: 'update-steamcmd-manual-path', value: string): void
  (e: 'update-login-timeout-ms', value: string): void
  (e: 'update-stored-session-timeout-ms', value: string): void
  (e: 'update-workshop-timeout-ms', value: string): void
  (e: 'pick-steamcmd-manual-path'): void
  (e: 'set-web-api-key-peek', value: boolean): void
  (e: 'save-advanced-settings'): void
  (e: 'clear-web-api-key'): void
}>()

function onWebApiKeyInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-web-api-key', target?.value ?? '')
}

function onSteamCmdManualPathInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-steamcmd-manual-path', target?.value ?? '')
}

function onLoginTimeoutInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-login-timeout-ms', target?.value ?? '')
}

function onLoginTimeoutDisabledChange(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit(
    'update-login-timeout-ms',
    toggleTimeoutValue(
      target?.checked === true,
      DEFAULT_STEAMCMD_TIMEOUT_SETTINGS.loginTimeoutMs
    )
  )
}

function onStoredSessionTimeoutInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-stored-session-timeout-ms', target?.value ?? '')
}

function onStoredSessionTimeoutDisabledChange(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit(
    'update-stored-session-timeout-ms',
    toggleTimeoutValue(
      target?.checked === true,
      DEFAULT_STEAMCMD_TIMEOUT_SETTINGS.storedSessionTimeoutMs
    )
  )
}

function onWorkshopTimeoutInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-workshop-timeout-ms', target?.value ?? '')
}

function onWorkshopTimeoutDisabledChange(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit(
    'update-workshop-timeout-ms',
    toggleTimeoutValue(
      target?.checked === true,
      DEFAULT_STEAMCMD_TIMEOUT_SETTINGS.workshopTimeoutMs
    )
  )
}

const canSaveAdvancedSettings = computed(() => {
  return !props.advancedSettings.isSaving && !isWebApiKeySaveBlocked.value
})

const canClearSteamCmdPath = computed(() => {
  return !props.advancedSettings.isSaving && props.advancedSettings.steamCmdManualPath.trim().length > 0
})

const isWebApiKeySaveBlocked = computed(() => {
  return !props.advancedSettings.secureStorageAvailable && props.advancedSettings.webApiKey.trim().length > 0
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

const steamCmdHint = computed(() => {
  if (props.advancedSettings.steamCmdSource === 'manual') {
    return 'Using a custom executable path saved for this device.'
  }
  if (props.advancedSettings.steamCmdSource === 'auto') {
    return 'Using the app-managed SteamCMD install.'
  }
  return 'Auto-install is available on Linux and Windows. On macOS, set this manually.'
})

const showsLoginTimeout = computed(() => true)
const showsStoredSessionTimeout = computed(() => props.timeoutScope === 'all')
const showsWorkshopTimeout = computed(() => props.timeoutScope === 'all')
const timeoutCardCopy = computed(() => {
  if (props.timeoutScope === 'login_only') {
    return 'Tune how long the app waits for a full SteamCMD login before marking sign-in as timed out.'
  }
  return 'Tune how long the app waits for SteamCMD login and Workshop actions before marking the run as timed out.'
})
const timeoutBadgeLabel = computed(() => props.timeoutScope === 'login_only' ? 'LOGIN' : 'RUNTIME')
const usesSingleTimeoutColumn = computed(() => props.timeoutScope === 'login_only')
const placesWebApiAfterTimeouts = computed(() => {
  return props.showWebApiSection && props.webApiSectionPlacement === 'after_timeouts'
})
const isLoginTimeoutDisabled = computed(() => {
  return isTimeoutDisabled(props.advancedSettings.loginTimeoutMs)
})
const isStoredSessionTimeoutDisabled = computed(() => {
  return isTimeoutDisabled(props.advancedSettings.storedSessionTimeoutMs)
})
const isWorkshopTimeoutDisabled = computed(() => {
  return isTimeoutDisabled(props.advancedSettings.workshopTimeoutMs)
})

function timeoutLimitSeconds(timeoutMs: number): number {
  return Math.round(timeoutMs / 1000)
}

function isTimeoutDisabled(value: string): boolean {
  return Number(value.trim()) === STEAMCMD_TIMEOUT_DISABLED_VALUE
}

function toggleTimeoutValue(disabled: boolean, defaultTimeoutMs: number): string {
  return String(
    disabled
      ? STEAMCMD_TIMEOUT_DISABLED_VALUE
      : timeoutLimitSeconds(defaultTimeoutMs)
  )
}
</script>

<template>
  <div class="advanced-panel" :class="{ 'advanced-panel-api-timeout-path': props.layoutPreset === 'api_timeout_path' }">
    <div class="advanced-header">
      <div>
        <p class="advanced-kicker">{{ props.kicker }}</p>
        <p class="advanced-summary">{{ props.summary }}</p>
      </div>
    </div>

    <div class="advanced-card-grid mt-4">
      <section
        v-if="props.showSteamCmdSection && props.layoutPreset !== 'api_timeout_path'"
        class="advanced-card advanced-card-steamcmd"
      >
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

      <section v-if="props.showWebApiSection && !placesWebApiAfterTimeouts" class="advanced-card advanced-card-webapi">
        <div class="advanced-card-header">
          <div>
            <h3 class="advanced-card-title">Steam Web API Key</h3>
            <p class="advanced-card-copy">To fully access this app's functionality.</p>
          </div>
          <span class="advanced-badge" :class="webApiStatusClass">{{ webApiStatusLabel }}</span>
        </div>

        <label class="advanced-label mt-4">Steam Web API Key</label>
        <p class="text-xs text-slate-400 mb-2">
          <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300">Get your free Steam API key →</a>
        </p>
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
              : 'Secure storage is not available. Leave the key field empty to save SteamCMD settings only.'
          }}
        </p>
        <p v-if="isWebApiKeySaveBlocked" class="advanced-meta">
          Clear the key field to save SteamCMD path changes without secure storage.
        </p>
        <p v-if="advancedSettings.hasWebApiKey" class="advanced-meta advanced-meta-success">Saved key detected and ready to use.</p>
      </section>

      <section class="advanced-card advanced-card-timeouts">
        <div class="advanced-card-header">
          <div>
            <h3 class="advanced-card-title">SteamCMD Timeouts</h3>
            <p class="advanced-card-copy">{{ timeoutCardCopy }}</p>
          </div>
          <span class="advanced-badge advanced-badge-info">{{ timeoutBadgeLabel }}</span>
        </div>

        <div
          class="advanced-timeout-grid mt-4"
          :class="{ 'advanced-timeout-grid-single': usesSingleTimeoutColumn }"
        >
          <div v-if="showsLoginTimeout" class="advanced-label">
            <span>Login Timeout (seconds)</span>
            <input
              type="number"
              inputmode="numeric"
              step="1"
              :min="timeoutLimitSeconds(STEAMCMD_TIMEOUT_LIMITS.loginTimeoutMs.min)"
              :max="timeoutLimitSeconds(STEAMCMD_TIMEOUT_LIMITS.loginTimeoutMs.max)"
              :value="isLoginTimeoutDisabled ? '' : advancedSettings.loginTimeoutMs"
              :disabled="isLoginTimeoutDisabled"
              :placeholder="isLoginTimeoutDisabled ? 'No timeout' : undefined"
              class="login-input advanced-input advanced-number-input mt-2"
              @input="onLoginTimeoutInput"
            />
            <span class="advanced-timeout-toggle">
              <input
                type="checkbox"
                aria-label="Disable login timeout"
                :checked="isLoginTimeoutDisabled"
                @change="onLoginTimeoutDisabledChange"
              />
              <span>Disable timeout</span>
            </span>
          </div>

          <label v-if="showsStoredSessionTimeout" class="advanced-label">
            Saved Session Timeout (seconds)
            <input
              type="number"
              inputmode="numeric"
              step="1"
              :min="timeoutLimitSeconds(STEAMCMD_TIMEOUT_LIMITS.storedSessionTimeoutMs.min)"
              :max="timeoutLimitSeconds(STEAMCMD_TIMEOUT_LIMITS.storedSessionTimeoutMs.max)"
              :value="isStoredSessionTimeoutDisabled ? '' : advancedSettings.storedSessionTimeoutMs"
              :disabled="isStoredSessionTimeoutDisabled"
              :placeholder="isStoredSessionTimeoutDisabled ? 'No timeout' : undefined"
              class="login-input advanced-input advanced-number-input mt-2"
              @input="onStoredSessionTimeoutInput"
            />
            <span class="advanced-timeout-toggle">
              <input
                type="checkbox"
                aria-label="Disable saved session timeout"
                :checked="isStoredSessionTimeoutDisabled"
                @change="onStoredSessionTimeoutDisabledChange"
              />
              <span>Disable timeout</span>
            </span>
          </label>

          <label v-if="showsWorkshopTimeout" class="advanced-label">
            Workshop Action Timeout (seconds)
            <input
              type="number"
              inputmode="numeric"
              step="1"
              :min="timeoutLimitSeconds(STEAMCMD_TIMEOUT_LIMITS.workshopTimeoutMs.min)"
              :max="timeoutLimitSeconds(STEAMCMD_TIMEOUT_LIMITS.workshopTimeoutMs.max)"
              :value="isWorkshopTimeoutDisabled ? '' : advancedSettings.workshopTimeoutMs"
              :disabled="isWorkshopTimeoutDisabled"
              :placeholder="isWorkshopTimeoutDisabled ? 'No timeout' : undefined"
              class="login-input advanced-input advanced-number-input mt-2"
              @input="onWorkshopTimeoutInput"
            />
            <span class="advanced-timeout-toggle">
              <input
                type="checkbox"
                aria-label="Disable workshop action timeout"
                :checked="isWorkshopTimeoutDisabled"
                @change="onWorkshopTimeoutDisabledChange"
              />
              <span>Disable timeout</span>
            </span>
          </label>
        </div>
      </section>

      <section v-if="props.showWebApiSection && placesWebApiAfterTimeouts" class="advanced-card advanced-card-webapi">
        <div class="advanced-card-header">
          <div>
            <h3 class="advanced-card-title">Steam Web API Key</h3>
            <p class="advanced-card-copy">To fully access this app's functionality.</p>
          </div>
          <span class="advanced-badge" :class="webApiStatusClass">{{ webApiStatusLabel }}</span>
        </div>

        <label class="advanced-label mt-4">Steam Web API Key</label>
        <p class="text-xs text-slate-400 mb-2">
          <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300">Get your free Steam API key →</a>
        </p>
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
              : 'Secure storage is not available. Leave the key field empty to save SteamCMD settings only.'
          }}
        </p>
        <p v-if="isWebApiKeySaveBlocked" class="advanced-meta">
          Clear the key field to save SteamCMD path changes without secure storage.
        </p>
        <p v-if="advancedSettings.hasWebApiKey" class="advanced-meta advanced-meta-success">Saved key detected and ready to use.</p>
      </section>

      <section
        v-if="props.showSteamCmdSection && props.layoutPreset === 'api_timeout_path'"
        class="advanced-card advanced-card-steamcmd"
      >
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
    </div>

    <p v-if="advancedSettings.statusMessage" class="advanced-feedback mt-4">{{ advancedSettings.statusMessage }}</p>

    <div class="advanced-actions mt-4">
      <button
        type="button"
        class="login-submit advanced-primary-action text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!canSaveAdvancedSettings"
        @click="emit('save-advanced-settings')"
      >
        {{ advancedSettings.isSaving ? 'Saving...' : props.saveLabel }}
      </button>
      <button
        v-if="props.showWebApiSection"
        type="button"
        class="login-peek advanced-secondary-action text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="advancedSettings.isSaving || !advancedSettings.hasWebApiKey"
        @click="emit('clear-web-api-key')"
      >
        Clear Saved Key
      </button>
    </div>
  </div>
</template>
