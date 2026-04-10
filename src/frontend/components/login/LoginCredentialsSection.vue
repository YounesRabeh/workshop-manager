<script setup lang="ts">
import type { AdvancedSettingsState, LoginFormState } from '../../types/ui'

const props = defineProps<{
  loginForm: LoginFormState
  isPasswordPeek: boolean
  passwordPlaceholder: string
  advancedSettings: AdvancedSettingsState
  isWebApiKeyPeek: boolean
  isApiSectionExpanded: boolean
  apiSectionToggleLabel: string
  webApiStatusLabel: string
  webApiStatusClass: string
  webApiStorageHint: string
  isWebApiKeySaveBlocked: boolean
  canSaveWebApiKey: boolean
  canClearSavedWebApiKey: boolean
  onControlArrowKey: (event: KeyboardEvent, index: number) => void
}>()

const emit = defineEmits<{
  (e: 'update-username', value: string): void
  (e: 'update-password', value: string): void
  (e: 'set-password-peek', value: boolean): void
  (e: 'update-web-api-key', value: string): void
  (e: 'toggle-api-section'): void
  (e: 'set-web-api-key-peek', value: boolean): void
  (e: 'save-advanced-settings'): void
  (e: 'clear-web-api-key'): void
}>()
</script>

<template>
  <section class="login-block">
    <p class="login-block-title">Credentials</p>
    <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500">Account name</label>
    <input
      data-login-control="username"
      :value="loginForm.username"
      class="login-input mt-1 w-full rounded px-3 py-2"
      @keydown="onControlArrowKey($event, 0)"
      @input="emit('update-username', ($event.target as HTMLInputElement | null)?.value ?? '')"
    />

    <label class="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
    <div class="mt-1 flex items-center gap-2">
      <input
        data-login-control="password"
        :value="loginForm.password"
        :type="isPasswordPeek ? 'text' : 'password'"
        :placeholder="passwordPlaceholder"
        autocomplete="current-password"
        class="login-input w-full rounded px-3 py-2"
        @keydown="onControlArrowKey($event, 1)"
        @input="emit('update-password', ($event.target as HTMLInputElement | null)?.value ?? '')"
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

    <div class="login-api-card">
      <div class="login-api-header">
        <div>
          <p class="login-api-title">
            Steam Web API Key
            <span
              class="ml-2 text-[11px] font-semibold uppercase tracking-[0.08em]"
              :class="{
                'text-emerald-300': webApiStatusLabel === 'Saved',
                'text-amber-300': webApiStatusLabel === 'Unavailable',
                'text-slate-400': webApiStatusLabel !== 'Saved' && webApiStatusLabel !== 'Unavailable'
              }"
            >
              {{ webApiStatusLabel }}
            </span>
          </p>
          <p class="login-api-copy">
            Add a Web API key to fully use this app, including non-public Workshop items.
          </p>
        </div>
        <div class="login-api-header-actions">
          <button
            type="button"
            class="login-peek login-api-toggle rounded px-3 py-2 text-xs font-semibold"
            :aria-expanded="isApiSectionExpanded ? 'true' : 'false'"
            @click="emit('toggle-api-section')"
          >
            {{ apiSectionToggleLabel }}
          </button>
        </div>
      </div>

      <div v-if="isApiSectionExpanded">
        <label class="advanced-label mt-3">Steam Web API Key</label>
        <p class="mt-1 text-xs">
          <a
            href="https://steamcommunity.com/dev/apikey"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[#8ed4ff] underline decoration-transparent transition-colors hover:text-[#c7ecff] hover:decoration-current"
          >
            Get your free Steam Web API key
          </a>
        </p>
        <div class="advanced-key-row">
          <input
            :type="isWebApiKeyPeek ? 'text' : 'password'"
            :value="advancedSettings.webApiKey"
            :placeholder="advancedSettings.hasWebApiKey ? 'Saved securely (enter new key to replace)' : 'Paste key...'"
            autocomplete="off"
            class="login-input advanced-input"
            @input="emit('update-web-api-key', ($event.target as HTMLInputElement | null)?.value ?? '')"
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

        <p class="login-api-meta">{{ webApiStorageHint }}</p>
        <p v-if="isWebApiKeySaveBlocked" class="login-api-meta login-api-meta-warning">
          Secure storage is unavailable. Clear this field to continue without a key.
        </p>
        <p v-if="advancedSettings.hasWebApiKey" class="login-api-meta login-api-meta-success">
          Saved key detected and ready to use.
        </p>

        <div class="login-api-actions">
          <button
            type="button"
            class="login-submit rounded px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!canSaveWebApiKey"
            @click="emit('save-advanced-settings')"
          >
            {{ advancedSettings.isSaving ? 'Saving...' : 'Save API Key' }}
          </button>
          <button
            type="button"
            class="login-peek rounded px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!canClearSavedWebApiKey"
            @click="emit('clear-web-api-key')"
          >
            Clear Saved Key
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
