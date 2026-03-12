import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/frontend/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        panel: '#0f172a',
        accent: '#f97316',
        ocean: '#0ea5e9'
      }
    }
  },
  plugins: []
} satisfies Config
