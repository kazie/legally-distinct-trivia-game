import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      // Dev-only harness, stories and entry points: not app code worth measuring.
      exclude: ['src/dev/**', '**/*.story.vue', 'src/histoire.setup.ts', 'src/env.d.ts', 'src/main.ts'],
      // json-summary and json feed the PR coverage comment in CI.
      reporter: ['text', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
    },
  },
})
