/**
 * Overview: Frontend bootstrap entrypoint for the Vue renderer application.
 * Responsibility: Initializes global styles, mounts the root `App` component, and starts the UI in `#app`.
 */
import { createApp } from 'vue'
import App from './App.vue'
import './styles/tailwind.css'

createApp(App).mount('#app')
