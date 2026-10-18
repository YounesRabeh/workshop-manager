/**
 * Overview: Provides global keyboard/mouse interaction handlers for app navigation and accessibility.
 * Responsibility: Maps hotkeys to flow navigation/fullscreen/back actions, 
 * manages directional focus movement, and normalizes keyboard behavior for form controls.
 */
import type { FlowStep } from '../types/ui'

type StepNavigator = (step: FlowStep) => void

interface AppGlobalKeyboardDeps {
  isAboutOpen: () => boolean
  toggleFullscreen: () => void
  closeAbout: () => void
  goToStep: StepNavigator
  scrollViewport: (direction: 1 | -1) => void
  canGoBack: () => boolean
  goBack: () => void
  isAuthenticated: () => boolean
}

/** Excludes inputs and editable elements from app-level keyboard shortcuts. */
function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  if (target instanceof HTMLTextAreaElement) {
    return true
  }
  if (target instanceof HTMLInputElement) {
    const type = (target.type || 'text').toLowerCase()
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color'].includes(type)
  }
  return false
}

/** Returns visible, enabled controls in the order used for keyboard navigation. */
function getFocusableElements(): HTMLElement[] {
  const selector = 'button,input,textarea,select,a[href],[tabindex]:not([tabindex="-1"])'
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    if (element.hasAttribute('disabled')) {
      return false
    }
    if (element.getAttribute('aria-hidden') === 'true') {
      return false
    }
    return element.getClientRects().length > 0
  })
}

/** Moves focus to the next or previous control, wrapping at either end of the list. */
function moveFocusByDirection(direction: 1 | -1): void {
  const focusable = getFocusableElements()
  if (focusable.length === 0) {
    return
  }

  const activeElement = document.activeElement as HTMLElement | null
  const currentIndex = activeElement ? focusable.indexOf(activeElement) : -1
  if (currentIndex < 0) {
    const fallbackIndex = direction > 0 ? 0 : focusable.length - 1
    focusable[fallbackIndex]?.focus()
    return
  }

  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), focusable.length - 1)
  focusable[nextIndex]?.focus()
}

/** Creates the global key handler for navigation, dialogs, and keyboard shortcuts. */
export function createAppGlobalKeyDownHandler(deps: AppGlobalKeyboardDeps): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return
    }

    if (event.key === 'F11') {
      event.preventDefault()
      deps.toggleFullscreen()
      return
    }

    if (event.key === 'Escape') {
      if (deps.isAboutOpen()) {
        event.preventDefault()
        deps.closeAbout()
        return
      }
      if (deps.canGoBack()) {
        event.preventDefault()
        deps.goBack()
        return
      }
    }

    if (event.key === 'BrowserBack' || event.key === 'GoBack') {
      if (deps.canGoBack()) {
        event.preventDefault()
        deps.goBack()
      }
      return
    }

    if (
      (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      if (event.key === 'ArrowUp') {
        if (isTextEditingTarget(event.target)) {
          return
        }
        event.preventDefault()
        deps.scrollViewport(-1)
        return
      }
      if (event.key === 'ArrowDown') {
        if (isTextEditingTarget(event.target)) {
          return
        }
        event.preventDefault()
        deps.scrollViewport(1)
        return
      }
      if (isTextEditingTarget(event.target)) {
        return
      }
      event.preventDefault()
      moveFocusByDirection(event.key === 'ArrowRight' ? 1 : -1)
      return
    }

    if (!deps.isAuthenticated()) {
      return
    }

    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (event.key === '1') {
        event.preventDefault()
        deps.goToStep('mods')
        return
      }
      if (event.key === '2') {
        event.preventDefault()
        deps.goToStep('update')
        return
      }
      if (event.key === '3') {
        event.preventDefault()
        deps.goToStep('create')
      }
    }
  }
}

interface AppGlobalMouseDeps {
  canGoBack: () => boolean
  goBack: () => void
}

/** Creates the global mouse handler that dismisses transient menus when clicked outside. */
export function createAppGlobalMouseDownHandler(deps: AppGlobalMouseDeps): (event: MouseEvent) => void {
  return (event: MouseEvent): void => {
    // Side mouse back button (XButton1 / button 3)
    if (event.button !== 3) {
      return
    }
    if (!deps.canGoBack()) {
      return
    }
    event.preventDefault()
    deps.goBack()
  }
}

/** Moves keyboard focus through a vertical group while preserving its selection behavior. */
export function moveFocusWithVerticalArrows(
  event: KeyboardEvent,
  index: number,
  getControl: (targetIndex: number) => HTMLElement | null,
  maxIndex: number
): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    getControl(Math.min(index + 1, maxIndex))?.focus()
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    getControl(Math.max(index - 1, 0))?.focus()
  }
}

/** Activates a checkbox or radio input when Enter is pressed. */
export function toggleCheckboxOrRadioOnEnter(event: KeyboardEvent): boolean {
  if (event.key !== 'Enter') {
    return false
  }
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return false
  }
  const type = (target.type || '').toLowerCase()
  if (type !== 'checkbox' && type !== 'radio') {
    return false
  }
  event.preventDefault()
  target.click()
  return true
}
