/**
 * Overview: vue-shim.d.ts module in frontend.
 * Responsibility: Holds the primary logic/exports for this area of the app.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}
