/// <reference types="vite/client" />

import type { WorkshopApi } from '../electron/preload'

declare global {
  interface Window {
    workshop: WorkshopApi
  }
}

export {}
