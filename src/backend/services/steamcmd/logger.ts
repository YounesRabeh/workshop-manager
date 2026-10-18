/**
 * Domain: SteamCMD execution.
 * Overview: Centralizes run-log persistence helpers and run event emission for SteamCMD sessions.
 * Responsibility: Provides consistent metadata formatting, log writes, and event dispatch wrappers
 * used across process management, run handling, and output processing helpers.
 */
import type { RunEvent } from '@shared/contracts'
import type { RunLogStore } from '@backend/stores/run-log-store'

/** Formats run meta for display or logging. */
function formatRunMeta(message: string): string {
  return `[RUN_META] ${message}`
}

class SteamCmdLogger {
  /** Connects the logger to the run-log store and current run state. */
  constructor(
    private readonly runLogStore: RunLogStore,
    private readonly emitRunEvent: (event: RunEvent) => void
  ) {}

  /** Formats run meta for display or logging. */
  formatRunMeta(message: string): string {
    return formatRunMeta(message)
  }

  /** Creates the persisted log record for a new SteamCMD run. */
  async create(runId: string): Promise<void> {
    await this.runLogStore.create(runId)
  }

  /** Persists one output line for the specified run. */
  async appendLine(runId: string, line: string): Promise<void> {
    await this.runLogStore.appendLine(runId, line)
  }

  /** Starts a log append without letting storage failures disrupt process handling. */
  appendLineNoThrow(runId: string, line: string): void {
    void this.runLogStore.appendLine(runId, line).catch(() => undefined)
  }

  /** Publishes a run event to the renderer-facing event listeners. */
  emit(event: RunEvent): void {
    this.emitRunEvent(event)
  }
}

export {
  formatRunMeta,
  SteamCmdLogger
}
