/**
 * Overview: env.d.ts module in frontend.
 * Responsibility: Holds the primary logic/exports for this area of the app.
 */
/// <reference types="vite/client" />

import type { WorkshopApi } from '../electron/preload'

declare global {
  interface Window {
    workshop: WorkshopApi
  }
}

export {}
