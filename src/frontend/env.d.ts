/**
 * Overview: Frontend ambient type declarations for Vite and preload-exposed globals.
 * Responsibility: Registers Vite client typings and augments `window` with the typed `workshop` IPC API.
 */
/// <reference types="vite/client" />

import type { WorkshopApi } from '../electron/preload'

declare global {
  interface Window {
    workshop: WorkshopApi
  }
}

export {}
