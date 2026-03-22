/**
 * Overview: TypeScript shim for importing Vue single-file components.
 * Responsibility: Declares the `*.vue` module type so SFC imports are recognized as typed Vue components.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}
