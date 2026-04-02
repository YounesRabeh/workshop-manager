<!--
  Overview: Signed-in settings modal for advanced runtime and integration configuration.
  Responsibility: Hosts the shared advanced settings panel inside a top-level dialog surface.
-->
<script setup lang="ts">
import type { AdvancedSettingsState } from '../../types/ui'
import AdvancedSettingsPanel from '../settings/AdvancedSettingsPanel.vue'

const props = defineProps<{
  open: boolean
  advancedSettings: AdvancedSettingsState
  isWebApiKeyPeek: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
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
  <div
    v-if="props.open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
    @click.self="emit('close')"
  >
    <article class="w-full max-w-5xl rounded-xl border border-[#2a475e] bg-[#162534] p-5 shadow-2xl">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Settings</p>
          <h2 class="mt-1 text-xl font-bold text-slate-100">Application Settings</h2>
          <p class="mt-2 text-sm text-slate-300">
            Adjust SteamCMD, Web API, and timeout behavior without leaving the signed-in workspace.
          </p>
        </div>
        <button class="steam-btn-muted rounded px-3 py-1.5 text-xs font-semibold" @click="emit('close')">Close</button>
      </div>

      <AdvancedSettingsPanel
        class="mt-5"
        :advanced-settings="props.advancedSettings"
        :is-web-api-key-peek="props.isWebApiKeyPeek"
        kicker="Application Settings"
        summary="Configure SteamCMD, optional Steam Web API access, and SteamCMD timeout behavior for this device."
        save-label="Save Settings"
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
  </div>
</template>
