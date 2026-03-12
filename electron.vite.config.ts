import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@frontend': resolve('src/frontend'),
        '@shared': resolve('src/shared'),
        '@backend': resolve('src/backend')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    },
    resolve: {
      alias: {
        '@frontend': resolve('src/frontend'),
        '@shared': resolve('src/shared'),
        '@backend': resolve('src/backend')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@frontend': resolve('src/frontend'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [vue()]
  }
})
