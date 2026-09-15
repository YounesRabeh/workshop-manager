import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@backend': resolve('src/backend'),
      '@frontend': resolve('src/frontend')
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    setupFiles: [resolve('test/setup.ts')],
    coverage: {
      provider: 'v8',
      include: [
        'src/backend/**/*.ts',
        'src/electron/**/*.ts',
        'src/frontend/**/*.{ts,vue}',
        'src/shared/**/*.ts'
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/backend/services/steamcmd/process-session-types.ts',
        'src/frontend/types/**',
        'src/shared/contracts.ts',
        'src/frontend/main.ts'
      ],
      reporter: ['text', 'html', 'json'],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 70,
        lines: 75,
        'src/electron/main.ts': {
          statements: 40,
          branches: 30,
          functions: 35,
          lines: 40
        },
        'src/electron/main-window.ts': {
          statements: 75,
          branches: 60,
          functions: 90,
          lines: 75
        },
        'src/electron/preload.ts': {
          statements: 95,
          branches: 95,
          lines: 95
        },
        'src/backend/services/steamcmd/install-manager.ts': {
          statements: 78,
          branches: 75,
          functions: 90,
          lines: 78
        },
        'src/backend/services/workshop/fetch-service.ts': {
          statements: 88,
          branches: 68,
          functions: 95,
          lines: 88
        },
        'src/frontend/composables/useWorkshopItems.ts': {
          statements: 82,
          branches: 82,
          functions: 80,
          lines: 82
        }
      }
    }
  }
})
