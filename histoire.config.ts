import { defineConfig } from 'histoire'
import { HstVue } from '@histoire/plugin-vue'

export default defineConfig({
  plugins: [HstVue()],
  setupFile: '/src/histoire.setup.ts',
  storyMatch: ['src/**/*.story.vue'],
  // GitHub Pages serves the build under /<repo>/ and has no SPA fallback, hence the base + hash routing.
  vite: { base: process.env.HISTOIRE_BASE ?? '/' },
  routerMode: 'hash',
  tree: {
    groups: [
      { id: 'top', title: '' },
      { id: 'screens', title: 'Screens' },
      { id: 'components', title: 'Components' },
    ],
  },
  theme: {
    title: 'Legally Distinct Trivia',
    defaultColorScheme: 'dark',
  },
  defaultStoryProps: {
    layout: { type: 'single', iframe: true },
  },
  backgroundPresets: [
    { label: 'App', color: '#060c30', contrastColor: '#f4f6ff' },
    { label: 'Transparent', color: 'transparent', contrastColor: '#333' },
  ],
})
