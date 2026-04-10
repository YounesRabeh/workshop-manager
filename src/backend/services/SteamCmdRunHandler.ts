/**
 * Overview: Handles SteamCMD run queuing and lifecycle setup concerns.
 * Responsibility: Prepares run context metadata, creates run timeouts/instances,
 * and dispatches interactive commands with guarded login-progress retry behavior.
 */
import { mkdir } from 'node:fs/promises'
import { AppError } from '@backend/utils/errors'
import { escapeInteractiveArg } from './steam-output-parser'
import type { SteamCmdPlatformBehavior } from './steamcmd-platform-profile'
import type {
  ActiveInteractiveRun,
  ActiveRunConfig,
  PreparedRunContext,
  RunPhase,
  SessionRunOptions,
  SteamCmdSessionState
} from './steamcmd-process-session-types'
import { SteamCmdLogger } from './SteamCmdLogger'

interface SteamCmdRunHandlerDeps {
  state: SteamCmdSessionState
  steamCmdExecutablePath: () => Promise<string>
  runtimeDir: string
  platformBehavior: SteamCmdPlatformBehavior
  logger: SteamCmdLogger
}

class SteamCmdRunHandler {
  constructor(private readonly deps: SteamCmdRunHandlerDeps) {}

  enqueueCommand<T>(task: () => Promise<T>): Promise<T> {
    const next = this.deps.state.commandQueue.then(task, task)
    this.deps.state.commandQueue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  async prepareRunContext(
    runId: string,
    options: SessionRunOptions,
    modeSuffix = ''
  ): Promise<PreparedRunContext> {
    const phase = options.phase as RunPhase
    const timeoutMs = options.timeoutMs ?? 5 * 60_000
    const executablePath = await this.deps.steamCmdExecutablePath()
    const persistLogs = options.persistLogs !== false
    const emitRunEvents = options.emitRunEvents !== false

    await mkdir(this.deps.runtimeDir, { recursive: true })
    if (persistLogs) {
      await this.deps.logger.create(runId)
    }
    if (emitRunEvents) {
      this.deps.logger.emit({ runId, ts: Date.now(), type: 'run_started', phase })
    }
    if (persistLogs) {
      const modeLabel = modeSuffix.length > 0 ? ` ${modeSuffix}` : ''
      const timeoutLabel = timeoutMs > 0 ? `${timeoutMs}` : 'disabled'
      await this.deps.logger.appendLine(
        runId,
        this.deps.logger.formatRunMeta(
          `started phase=${phase} timeoutMs=${timeoutLabel} executable=${executablePath}${modeLabel}`
        )
      )
    }

    return {
      executablePath,
      timeoutMs,
      phase,
      persistLogs,
      emitRunEvents
    }
  }

  createRunTimeout(
    runId: string,
    timeoutMs: number,
    persistLogs: boolean,
    timeoutMeta: string,
    onTimeout: () => void
  ): ReturnType<typeof setTimeout> | null {
    if (timeoutMs <= 0) {
      return null
    }

    return setTimeout(() => {
      if (persistLogs) {
        this.deps.logger.appendLineNoThrow(runId, this.deps.logger.formatRunMeta(timeoutMeta))
      }
      onTimeout()
    }, timeoutMs)
  }

  createActiveRun(config: ActiveRunConfig): ActiveInteractiveRun {
    return {
      runId: config.runId,
      phase: config.phase,
      command: config.command,
      commandDispatched: config.commandDispatched ?? false,
      waitForPromptBeforeDispatch: config.waitForPromptBeforeDispatch ?? false,
      promptDispatchFallback: null,
      loginProgressRetry: null,
      loginProgressObserved: false,
      loginDispatchAttempts: 0,
      emitRunEvents: config.emitRunEvents,
      persistLogs: config.persistLogs,
      writeInput: config.writeInput,
      lines: [],
      emitOutputEvents: config.emitOutputEvents,
      timeout: config.timeout,
      settleTimeout: null,
      lineQueue: Promise.resolve(),
      pendingResult: null,
      guardMobilePromptSent: false,
      resolve: config.resolve,
      reject: config.reject
    }
  }

  dispatchCommandIfReady(
    activeRun: ActiveInteractiveRun,
    writeInteractiveInput: (value: string) => void
  ): void {
    if (this.deps.state.activeInteractiveRun !== activeRun || activeRun.commandDispatched) {
      return
    }
    if (activeRun.promptDispatchFallback) {
      clearTimeout(activeRun.promptDispatchFallback)
      activeRun.promptDispatchFallback = null
    }
    activeRun.commandDispatched = true
    activeRun.loginDispatchAttempts += 1
    writeInteractiveInput(activeRun.command)
    this.scheduleLoginProgressRetry(activeRun, writeInteractiveInput)
  }

  buildInteractiveCommand(args: string[], phase: RunPhase): string {
    if (phase === 'login') {
      const loginIndex = args.indexOf('+login')
      if (loginIndex < 0 || !args[loginIndex + 1]) {
        throw new AppError('validation', 'Invalid login command args')
      }
      const username = args[loginIndex + 1]
      const maybePassword = args[loginIndex + 2]
      const hasPassword = Boolean(maybePassword && !maybePassword.startsWith('+'))
      if (hasPassword) {
        return `login ${escapeInteractiveArg(username)} ${escapeInteractiveArg(maybePassword!)}`
      }
      return `login ${escapeInteractiveArg(username)}`
    }

    const workshopIndex = args.indexOf('+workshop_build_item')
    if (workshopIndex < 0 || !args[workshopIndex + 1]) {
      throw new AppError('validation', 'Invalid workshop command args')
    }

    return `workshop_build_item ${escapeInteractiveArg(args[workshopIndex + 1])}`
  }

  private scheduleLoginProgressRetry(
    activeRun: ActiveInteractiveRun,
    writeInteractiveInput: (value: string) => void
  ): void {
    if (
      this.deps.state.activeInteractiveRun !== activeRun ||
      activeRun.phase !== 'login' ||
      !this.deps.platformBehavior.enableInteractiveLoginRetry ||
      activeRun.loginProgressObserved ||
      activeRun.loginDispatchAttempts !== 1
    ) {
      return
    }

    if (activeRun.loginProgressRetry) {
      clearTimeout(activeRun.loginProgressRetry)
    }

    activeRun.loginProgressRetry = setTimeout(() => {
      if (
        this.deps.state.activeInteractiveRun !== activeRun ||
        activeRun.phase !== 'login' ||
        activeRun.loginProgressObserved ||
        activeRun.loginDispatchAttempts !== 1
      ) {
        return
      }

      activeRun.loginDispatchAttempts += 1
      this.deps.logger.appendLineNoThrow(
        activeRun.runId,
        this.deps.logger.formatRunMeta(
          'no login progress observed after initial windows-profile dispatch, retrying login command'
        )
      )
      writeInteractiveInput(activeRun.command)
    }, 2_500)
  }
}

export {
  SteamCmdRunHandler
}
