<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    isVisible: boolean
    extraClass?: string
  }>(),
  {
    extraClass: ''
  }
)

const emit = defineEmits<{
  (e: 'toggle'): void
}>()
</script>

<template>
  <button
    type="button"
    :class="['login-peek rounded px-3 py-2 text-xs font-semibold', extraClass]"
    :aria-pressed="isVisible ? 'true' : 'false'"
    @click="emit('toggle')"
  >
    {{ isVisible ? 'Hide' : 'Show' }}
  </button>
</template>
