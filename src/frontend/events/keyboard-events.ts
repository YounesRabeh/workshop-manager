import type { FlowStep } from '../types/ui'

type StepNavigator = (step: FlowStep) => void

interface AppGlobalKeyboardDeps {
  isAboutOpen: () => boolean
  toggleFullscreen: () => void
  closeAbout: () => void
  goToStep: StepNavigator
  canGoBack: () => boolean
  goBack: () => void
  isAuthenticated: () => boolean
}

export function createAppGlobalKeyDownHandler(deps: AppGlobalKeyboardDeps): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent): void => {
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
