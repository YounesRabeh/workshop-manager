<!--
  Overview: Authenticated app header and primary navigation surface.
  Responsibility: Displays account/session summary, exposes top-level actions (about/fullscreen/sign out), and routes between mods/update/create steps.
-->
<script setup lang="ts">
import { computed } from 'vue'
import profilePlaceholder from '../assets/profile-placeholder.svg'
import '../styles/themes/app-top-bar.theme.css'

type FlowStep = 'mods' | 'update' | 'create'

const props = defineProps<{
  flowStep: FlowStep
  canAccessUpdate: boolean
  accountDisplayName: string
  workshopItemsCount: number
  appVersion: string
  isFullscreen: boolean
  profileImageUrl?: string | null
}>()

const emit = defineEmits<{
  (e: 'navigate', step: FlowStep): void
  (e: 'open-about'): void
  (e: 'toggle-fullscreen'): void
  (e: 'sign-out'): void
}>()

const avatarSrc = computed(() => props.profileImageUrl?.trim() || profilePlaceholder)
</script>

<template>
  <section class="app-top-bar fade-in app-panel overflow-hidden rounded-xl border border-[#2a475e] bg-white/85 p-6 shadow-lg md:p-7">
    <div class="topbar-header flex flex-wrap items-start justify-between gap-5 px-1 py-1">
      <div class="session-media flex min-w-0 items-center gap-5">
        <img :src="avatarSrc" :alt="`${accountDisplayName} avatar`" class="session-avatar" />
        <div class="min-w-0">
          <p class="session-label text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Signed in as</p>
          <p class="session-name truncate text-[2rem] font-extrabold leading-tight text-slate-900">{{ accountDisplayName }}</p>
          <p class="session-meta mt-1 text-base text-slate-600">
            Workshop items loaded: {{ workshopItemsCount }}
          </p>
        </div>
      </div>

      <div class="toolbar-actions flex items-center gap-2.5">
        <button class="toolbar-btn rounded px-3.5 py-2 text-sm font-semibold" @click="emit('open-about')">About</button>
        <button class="toolbar-btn rounded px-3.5 py-2 text-sm font-semibold" @click="emit('toggle-fullscreen')">
          {{ isFullscreen ? 'Windowed' : 'Fullscreen' }}
        </button>
        <button class="steam-btn-signout rounded px-3.5 py-2 text-sm font-semibold shadow" @click="emit('sign-out')">Sign out</button>
      </div>
    </div>

    <nav class="menu-strip mt-5 flex flex-wrap items-center gap-7 pb-2">
      <button
        class="menu-tab px-0.5 py-1 text-xl font-semibold transition"
        :class="flowStep === 'mods' ? 'menu-tab-active' : ''"
        @click="emit('navigate', 'mods')"
      >
        Workshop Items
      </button>
      <button
        class="menu-tab px-0.5 py-1 text-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
        :class="flowStep === 'update' ? 'menu-tab-active' : ''"
        :disabled="!canAccessUpdate"
        @click="emit('navigate', 'update')"
      >
        Update
      </button>
      <button
        class="menu-tab px-0.5 py-1 text-xl font-semibold transition"
        :class="flowStep === 'create' ? 'menu-tab-active' : ''"
        @click="emit('navigate', 'create')"
      >
        Create
      </button>
    </nav>
  </section>
</template>
