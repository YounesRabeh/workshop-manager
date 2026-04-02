<!--
  Overview: Authenticated settings stage for app-level SteamCMD and integration configuration.
  Responsibility: Presents advanced settings as a full app section rather than a modal overlay.
-->
<script setup lang="ts">
import type { AdvancedSettingsState } from '../../../types/ui'
import AdvancedSettingsPanel from '../AdvancedSettingsPanel.vue'

defineProps<{
  advancedSettings: AdvancedSettingsState
  isWebApiKeyPeek: boolean
}>()

const emit = defineEmits<{
  (e: 'go-to-mods'): void
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
</script>

<template>
  <section class="mt-5 fade-in" aria-label="Settings section">
    <article class="app-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-md">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Application Settings</p>
          <h2 class="mt-1 text-2xl font-bold text-slate-900">Settings</h2>
          <p class="mt-2 max-w-3xl text-sm text-slate-600">
            Adjust runtime timeout behavior in a dedicated workspace instead of an in-app popup.
          </p>
        </div>
        <button
          type="button"
          class="steam-btn-muted inline-flex h-8 items-center justify-center gap-1 rounded px-2.5 text-xs font-semibold text-slate-100"
          @click="emit('go-to-mods')"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Mod List</span>
        </button>
      </div>

      <AdvancedSettingsPanel
        class="mt-5"
        :advanced-settings="advancedSettings"
        :is-web-api-key-peek="isWebApiKeyPeek"
        kicker="Application Settings"
        summary="Configure all SteamCMD timeout behavior for this device."
        save-label="Save Settings"
        timeout-scope="all"
        :show-steam-cmd-section="false"
        :show-web-api-section="false"
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
    </article>
  </section>
</template>
