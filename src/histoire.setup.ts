import { defineSetupVue3 } from '@histoire/plugin-vue'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from './router'
import './styles/main.css'

export const setupVue3 = defineSetupVue3(({ app }) => {
  // Views use RouterLink/useRouter; a memory router keeps story navigation inside the iframe.
  app.use(createAppRouter(createMemoryHistory()))
})
