<script setup lang="ts">
import type { LoginFormState } from '../../types/ui'

defineProps<{
  loginForm: LoginFormState
  isLoginSubmitting: boolean
  canClearStoredSession: boolean
  missingStoredSessionHint: string
  onControlArrowKey: (event: KeyboardEvent, index: number) => void
}>()

const emit = defineEmits<{
  (e: 'update-remember-username', value: boolean): void
  (e: 'update-remember-auth', value: boolean): void
  (e: 'clear-stored-session'): void
}>()
</script>

<template>
  <section class="login-block login-session-embedded">
    <p class="login-block-title">Session</p>
    <div class="mt-1 flex items-center gap-2 text-sm text-slate-700">
      <input
        data-login-control="remember-username"
        :checked="loginForm.rememberUsername"
        type="checkbox"
        @keydown="onControlArrowKey($event, 2)"
        @change="emit('update-remember-username', ($event.target as HTMLInputElement | null)?.checked ?? false)"
      />
      <span>Remember account name</span>
    </div>

    <div class="mt-2 flex items-center gap-2 text-sm text-slate-700">
      <input
        data-login-control="remember-auth"
        :checked="loginForm.rememberAuth"
        type="checkbox"
        @keydown="onControlArrowKey($event, 3)"
        @change="emit('update-remember-auth', ($event.target as HTMLInputElement | null)?.checked ?? false)"
      />
      <span>Keep me signed in on this device</span>
    </div>
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
</template>
