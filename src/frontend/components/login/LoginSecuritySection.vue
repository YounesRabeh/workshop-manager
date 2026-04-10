<script setup lang="ts">
import { toggleCheckboxOrRadioOnEnter } from '../../events/keyboard-events'
import type { PreferredAuthMode } from '../../types/ui'

defineProps<{
  preferredAuthMode: PreferredAuthMode
  securityStatusTitle: string
  securityStatusCopy: string
  securityCardClass: string
  shouldShowOtpEntry: boolean
  steamGuardCode: string
  canSubmitOtpCode: boolean
  otpSubmitLabel: string
}>()

const emit = defineEmits<{
  (e: 'update-preferred-auth-mode', value: PreferredAuthMode): void
  (e: 'update-steam-guard-code', value: string): void
  (e: 'submit-guard-code'): void
}>()
</script>

<template>
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
          @change="emit('update-preferred-auth-mode', 'otp')"
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
          @change="emit('update-preferred-auth-mode', 'steam_guard_mobile')"
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
          @input="emit('update-steam-guard-code', ($event.target as HTMLInputElement | null)?.value ?? '')"
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
    </div>
  </section>
</template>
