/**
 * Overview: Processes SteamCMD output streams and resolves active run state transitions.
 * Responsibility: Splits buffered chunk output into lines, detects prompts/challenges,
 * updates run result state, and emits output/guard events through shared logger utilities.
 */
import { AppError } from '@backend/utils/errors'
import {
  isBenignSteamLatencyWarning,
  isLoginSuccessLine,
  isLoginProgressLine,
  isSteamGuardMobilePrompt,
  isSteamGuardMobileTimeout,
  isSteamGuardPrompt,
  isWorkshopSuccessLine,
  parseSteamLoginFailure,
  parseWorkshopRunFailure,
  stripAnsi
} from './steam-output-parser'
import type {
  ActiveInteractiveRun,
  OneShotBuffers,
  RunPhase,
  SteamCmdSessionState
} from './steamcmd-process-session-types'
import { SteamCmdLogger } from './SteamCmdLogger'

interface SteamCmdOutputProcessorDeps {
  state: SteamCmdSessionState
  logger: SteamCmdLogger
  onDispatchCommandIfReady: (activeRun: ActiveInteractiveRun) => void
  onFailActiveRun: (activeRun: ActiveInteractiveRun, error: Error) => void
  onScheduleActiveRunSettle: (activeRun: ActiveInteractiveRun) => void
}

function isSteamPromptLine(line: string): boolean {
  return /steam>\s*$/i.test(line)
}

class SteamCmdOutputProcessor {
  private stdoutBuffer = ''
  private stderrBuffer = ''

  constructor(private readonly deps: SteamCmdOutputProcessorDeps) {}

  createOneShotBuffers(): OneShotBuffers {
    return { stdout: '', stderr: '' }
  }

  handlePersistentChunk(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    const incoming = chunk.toString('utf8')
    if (stream === 'stdout') {
      this.stdoutBuffer += incoming
      const parts = this.stdoutBuffer.split(/\r?\n/)
      this.stdoutBuffer = parts.pop() ?? ''
      for (const part of parts) {
        this.routeLineToActiveRun(part, 'stdout')
      }
      if (this.stdoutBuffer.trim().endsWith('Steam>')) {
        this.routeLineToActiveRun(this.stdoutBuffer, 'stdout')
        this.stdoutBuffer = ''
      }
      return
    }

    this.stderrBuffer += incoming
    const parts = this.stderrBuffer.split(/\r?\n/)
    this.stderrBuffer = parts.pop() ?? ''
    for (const part of parts) {
      this.routeLineToActiveRun(part, 'stderr')
    }
  }

  handleOneShotProcessChunk(
    stream: 'stdout' | 'stderr',
    chunk: Buffer,
    buffers: OneShotBuffers
  ): void {
    const incoming = chunk.toString('utf8')
    const key = stream === 'stdout' ? 'stdout' : 'stderr'
    buffers[key] += incoming
    const parts = buffers[key].split(/\r?\n/)
    buffers[key] = parts.pop() ?? ''
    for (const part of parts) {
      this.routeLineToActiveRun(part, stream)
    }
  }

  flushPersistentTrailingLines(): void {
    const trailingStdout = this.stdoutBuffer.trim()
    const trailingStderr = this.stderrBuffer.trim()
    this.stdoutBuffer = ''
    this.stderrBuffer = ''
    if (trailingStdout.length > 0) {
      this.routeLineToActiveRun(trailingStdout, 'stdout')
    }
    if (trailingStderr.length > 0) {
      this.routeLineToActiveRun(trailingStderr, 'stderr')
    }
  }

  flushOneShotTrailingLines(buffers: OneShotBuffers): void {
    const trailingStdout = buffers.stdout.trim()
    const trailingStderr = buffers.stderr.trim()
    buffers.stdout = ''
    buffers.stderr = ''
    if (trailingStdout.length > 0) {
      this.routeLineToActiveRun(trailingStdout, 'stdout')
    }
    if (trailingStderr.length > 0) {
      this.routeLineToActiveRun(trailingStderr, 'stderr')
    }
  }

  deriveOneShotPendingResult(
    phase: RunPhase,
    lines: string[],
    exitCode: number | null
  ): { exitCode: number; runtimeError?: AppError } {
    if (phase === 'login') {
      const parsedLoginFailure = parseSteamLoginFailure(lines)
      if (parsedLoginFailure) {
        return { exitCode: 1 }
      }
      if (lines.some((line) => isLoginSuccessLine(line))) {
        return { exitCode: exitCode ?? 0 }
      }
      if ((exitCode ?? 1) !== 0) {
        return {
          exitCode: exitCode ?? 1,
          runtimeError: new AppError('command_failed', `SteamCMD process exited unexpectedly (code ${exitCode ?? 1})`)
        }
      }
      return {
        exitCode: 1,
        runtimeError: new AppError('auth', 'Steam login failed. Check credentials or guard method.')
      }
    }

    const parsedWorkshopFailure = parseWorkshopRunFailure(lines, phase)
    if (parsedWorkshopFailure) {
      return { exitCode: exitCode ?? 1 }
    }
    if ((exitCode ?? 0) === 0) {
      return { exitCode: 0 }
    }
    return { exitCode: exitCode ?? 1 }
  }

  private routeLineToActiveRun(line: string, type: 'stdout' | 'stderr'): void {
    const normalizedLine = stripAnsi(line).trim()
    if (!normalizedLine) {
      return
    }
    if (isSteamPromptLine(normalizedLine)) {
      this.deps.state.persistentPromptReady = true
    }

    const activeRun = this.deps.state.activeInteractiveRun
    if (!activeRun) {
      return
    }

    activeRun.lineQueue = activeRun.lineQueue
      .then(async () => {
        if (activeRun.waitForPromptBeforeDispatch && !activeRun.commandDispatched && isSteamPromptLine(normalizedLine)) {
          this.deps.onDispatchCommandIfReady(activeRun)
        }

        if (activeRun.phase === 'login' && isLoginProgressLine(normalizedLine)) {
          activeRun.loginProgressObserved = true
          if (activeRun.loginProgressRetry) {
            clearTimeout(activeRun.loginProgressRetry)
            activeRun.loginProgressRetry = null
          }
        }

        if (activeRun.phase === 'login' && isSteamGuardMobilePrompt(normalizedLine) && !activeRun.guardMobilePromptSent) {
          activeRun.guardMobilePromptSent = true
          if (activeRun.emitRunEvents) {
            this.deps.logger.emit({
              runId: activeRun.runId,
              ts: Date.now(),
              type: 'steam_guard_required',
              phase: activeRun.phase,
              promptType: 'steam_guard_mobile'
            })
          }
        }

        if (
          activeRun.phase === 'login' &&
          isSteamGuardPrompt(normalizedLine) &&
          this.deps.state.pendingSteamGuard.has(activeRun.runId) === false
        ) {
          if (activeRun.emitRunEvents) {
            this.deps.logger.emit({
              runId: activeRun.runId,
              ts: Date.now(),
              type: 'steam_guard_required',
              phase: activeRun.phase,
              promptType: 'steam_guard_code'
            })
          }

          const guardPromise = new Promise<string>((guardResolve, guardReject) => {
            this.deps.state.pendingSteamGuard.set(activeRun.runId, {
              resolve: guardResolve,
              reject: guardReject
            })
          })

          try {
            const guardCode = await guardPromise
            activeRun.writeInput(guardCode)
          } catch (error) {
            this.deps.onFailActiveRun(
              activeRun,
              error instanceof Error ? error : new AppError('steam_guard', 'Steam Guard submission failed')
            )
            return
          } finally {
            this.deps.state.pendingSteamGuard.delete(activeRun.runId)
          }
        }

        activeRun.lines.push(normalizedLine)
        if (activeRun.persistLogs) {
          this.deps.logger.appendLineNoThrow(activeRun.runId, normalizedLine)
        }
        if (activeRun.emitOutputEvents && !isBenignSteamLatencyWarning(normalizedLine)) {
          this.deps.logger.emit({
            runId: activeRun.runId,
            ts: Date.now(),
            type,
            line: normalizedLine,
            phase: activeRun.phase
          })
        }

        if (activeRun.pendingResult) {
          this.deps.onScheduleActiveRunSettle(activeRun)
          return
        }

        if (activeRun.phase === 'login') {
          if (isSteamGuardMobileTimeout(activeRun.lines)) {
            activeRun.pendingResult = { exitCode: 1 }
            this.deps.onScheduleActiveRunSettle(activeRun)
            return
          }

          const parsedLoginFailure = parseSteamLoginFailure(activeRun.lines)
          if (parsedLoginFailure) {
            activeRun.pendingResult = { exitCode: 1 }
            this.deps.onScheduleActiveRunSettle(activeRun)
            return
          }

          if (isLoginSuccessLine(normalizedLine)) {
            activeRun.pendingResult = { exitCode: 0 }
            this.deps.onScheduleActiveRunSettle(activeRun)
          }
          return
        }

        const parsedFailure = parseWorkshopRunFailure(activeRun.lines, activeRun.phase)
        if (
          parsedFailure &&
          /error|failed|no connection|not logged on|rate limit|service unavailable|unable to connect|failed to connect/i.test(
            normalizedLine
          )
        ) {
          activeRun.pendingResult = {
            exitCode: 1
          }
          this.deps.onScheduleActiveRunSettle(activeRun)
          return
        }

        if (isWorkshopSuccessLine(normalizedLine)) {
          activeRun.pendingResult = { exitCode: 0 }
          this.deps.onScheduleActiveRunSettle(activeRun)
        }
      })
      .catch((error: unknown) => {
        this.deps.onFailActiveRun(
          activeRun,
          error instanceof Error ? error : new AppError('command_failed', 'SteamCMD line processing failed')
        )
      })
  }
}

export {
  SteamCmdOutputProcessor
}
