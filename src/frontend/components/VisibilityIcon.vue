<script setup lang="ts">
type Visibility = 0 | 1 | 2 | 3 | undefined

const props = defineProps<{
  visibility: Visibility
}>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    class="h-4 w-4 shrink-0 opacity-95"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-if="props.visibility === 0">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16" />
    </template>
    <template v-else-if="props.visibility === 1">
      <circle cx="9" cy="9" r="3" />
      <circle cx="16.5" cy="10.5" r="2.5" />
      <path d="M4 19c.8-2.7 3.2-4 5-4s4.2 1.3 5 4M14.5 19c.4-1.7 1.6-2.7 3.1-3.1" />
    </template>
    <template v-else-if="props.visibility === 2">
      <path d="M3 3l18 18" />
      <path d="M10.5 10.5A2.1 2.1 0 0 0 12 14a2.1 2.1 0 0 0 1.5-.6" />
      <path d="M20.2 14.2A13.4 13.4 0 0 1 12 17c-5 0-8.6-3.2-10-5 1-1.4 2.3-2.6 3.8-3.6" />
      <path d="M9.1 5.3A11.2 11.2 0 0 1 12 5c5 0 8.6 3.2 10 5a14 14 0 0 1-2.2 2.5" />
    </template>
    <template v-else-if="props.visibility === 3">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </template>
    <template v-else>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5" />
      <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
    </template>
  </svg>
</template>
