<!--
  Overview: Shared advanced settings form for SteamCMD, Web API, and runtime timeout configuration.
  Responsibility: Renders editable advanced settings fields and emits normalized updates without owning persistence itself.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { STEAMCMD_TIMEOUT_LIMITS } from '@shared/runtime-settings'
import type { AdvancedSettingsState } from '../../types/ui'

const props = withDefaults(defineProps<{
  advancedSettings: AdvancedSettingsState
  isWebApiKeyPeek: boolean
  kicker?: string
  summary?: string
  saveLabel?: string
}>(), {
  kicker: 'Advanced Developer Options',
  summary: 'Configure a custom SteamCMD path, optional Steam Web API access, and SteamCMD timeout behavior for this device.',
  saveLabel: 'Save Advanced Options'
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

function onStoredSessionTimeoutInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-stored-session-timeout-ms', target?.value ?? '')
}

function onWorkshopTimeoutInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update-workshop-timeout-ms', target?.value ?? '')
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
</script>

<template>
  <div class="advanced-panel">
    <div class="advanced-header">
      <div>
        <p class="advanced-kicker">{{ props.kicker }}</p>
        <p class="advanced-summary">{{ props.summary }}</p>
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
              : 'Secure storage is not available. Leave the key field empty to save SteamCMD settings only.'
          }}
        </p>
        <p v-if="isWebApiKeySaveBlocked" class="advanced-meta">
          Clear the key field to save SteamCMD path changes without secure storage.
        </p>
        <p v-if="advancedSettings.hasWebApiKey" class="advanced-meta advanced-meta-success">Saved key detected and ready to use.</p>
      </section>

      <section class="advanced-card">
        <div class="advanced-card-header">
          <div>
            <h3 class="advanced-card-title">SteamCMD Timeouts</h3>
            <p class="advanced-card-copy">Tune how long the app waits for SteamCMD login and Workshop actions before marking the run as timed out.</p>
          </div>
          <span class="advanced-badge advanced-badge-info">Runtime</span>
        </div>

        <div class="advanced-timeout-grid mt-4">
          <label class="advanced-label">
            Login Timeout
            <input
              type="number"
              inputmode="numeric"
              :min="STEAMCMD_TIMEOUT_LIMITS.loginTimeoutMs.min"
              :max="STEAMCMD_TIMEOUT_LIMITS.loginTimeoutMs.max"
              :value="advancedSettings.loginTimeoutMs"
              class="login-input advanced-input mt-2"
              @input="onLoginTimeoutInput"
            />
            <span class="advanced-meta">Used for full username/password sign-ins.</span>
          </label>

          <label class="advanced-label">
            Saved Session Timeout
            <input
              type="number"
              inputmode="numeric"
              :min="STEAMCMD_TIMEOUT_LIMITS.storedSessionTimeoutMs.min"
              :max="STEAMCMD_TIMEOUT_LIMITS.storedSessionTimeoutMs.max"
              :value="advancedSettings.storedSessionTimeoutMs"
              class="login-input advanced-input mt-2"
              @input="onStoredSessionTimeoutInput"
            />
            <span class="advanced-meta">Used when restoring a cached SteamCMD login.</span>
          </label>

          <label class="advanced-label">
            Workshop Action Timeout
            <input
              type="number"
              inputmode="numeric"
              :min="STEAMCMD_TIMEOUT_LIMITS.workshopTimeoutMs.min"
              :max="STEAMCMD_TIMEOUT_LIMITS.workshopTimeoutMs.max"
              :value="advancedSettings.workshopTimeoutMs"
              class="login-input advanced-input mt-2"
              @input="onWorkshopTimeoutInput"
            />
            <span class="advanced-meta">Used for create, update, and visibility actions.</span>
          </label>
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
