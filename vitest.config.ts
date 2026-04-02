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
    include: ['test/**/*.spec.ts']
  }
})