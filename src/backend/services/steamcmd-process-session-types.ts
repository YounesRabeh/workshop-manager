/**
 * Overview: Shared internal types used by SteamCmdProcessSession and its helper modules.
 * Responsibility: Centralizes run/session state and callback contracts to keep extracted
 * process/run/output/logger modules aligned without changing external runtime service APIs.
 */
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { RunEvent } from '@shared/contracts'
import type { AppError } from '@backend/utils/errors'
import type { RunLogStore } from '@backend/stores/run-log-store'

interface GuardPrompt {
  resolve: (code: string) => void
  reject: (error: Error) => void
}

interface SessionRunOptions {
  timeoutMs?: number
  phase: RunPhase
  emitOutputEvents?: boolean
  emitRunEvents?: boolean
  persistLogs?: boolean
}

type RunPhase = 'login' | 'upload' | 'update' | 'visibility'

interface ActiveInteractiveRun {
  runId: string
  phase: RunPhase
  command: string
  commandDispatched: boolean
  waitForPromptBeforeDispatch: boolean
  promptDispatchFallback: ReturnType<typeof setTimeout> | null
  loginProgressRetry: ReturnType<typeof setTimeout> | null
  loginProgressObserved: boolean
  loginDispatchAttempts: number
  emitRunEvents: boolean
  persistLogs: boolean
  writeInput: (value: string) => void
  lines: string[]
  emitOutputEvents: boolean
  timeout: ReturnType<typeof setTimeout> | null
  settleTimeout: ReturnType<typeof setTimeout> | null
  lineQueue: Promise<void>
  pendingResult: { exitCode: number; runtimeError?: AppError } | null
  guardMobilePromptSent: boolean
  resolve: (value: { lines: string[]; exitCode: number }) => void
  reject: (error: Error) => void
}

interface SteamCmdProcessSessionDeps {
  steamCmdExecutablePath: () => Promise<string>
  runLogStore: RunLogStore
  runtimeDir: string
  emitRunEvent: (event: RunEvent) => void
  onSessionInvalidated: () => void
}

interface PreparedRunContext {
  executablePath: string
  timeoutMs: number
  phase: RunPhase
  persistLogs: boolean
  emitRunEvents: boolean
}

interface ActiveRunConfig {
  runId: string
  phase: RunPhase
  command: string
  emitRunEvents: boolean
  persistLogs: boolean
  emitOutputEvents: boolean
  timeout: ReturnType<typeof setTimeout> | null
  writeInput: (value: string) => void
  resolve: (value: { lines: string[]; exitCode: number }) => void
  reject: (error: Error) => void
  commandDispatched?: boolean
  waitForPromptBeforeDispatch?: boolean
}

interface SteamCmdSessionState {
  activeRuns: Map<string, ChildProcessWithoutNullStreams>
  pendingSteamGuard: Map<string, GuardPrompt>
  persistentProcess: ChildProcessWithoutNullStreams | null
  persistentPromptReady: boolean
  activeInteractiveRun: ActiveInteractiveRun | null
  commandQueue: Promise<void>
}

interface OneShotBuffers {
  stdout: string
  stderr: string
}

export type {
  ActiveInteractiveRun,
  ActiveRunConfig,
  GuardPrompt,
  OneShotBuffers,
  PreparedRunContext,
  RunPhase,
  SessionRunOptions,
  SteamCmdProcessSessionDeps,
  SteamCmdSessionState
}
