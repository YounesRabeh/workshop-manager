/**
 * Overview: Centralizes run-log persistence helpers and run event emission for SteamCMD sessions.
 * Responsibility: Provides consistent metadata formatting, log writes, and event dispatch wrappers
 * used across process management, run handling, and output processing helpers.
 */
import type { RunEvent } from '@shared/contracts'
import type { RunLogStore } from '@backend/stores/run-log-store'

function formatRunMeta(message: string): string {
  return `[RUN_META] ${message}`
}

class SteamCmdLogger {
  constructor(
    private readonly runLogStore: RunLogStore,
    private readonly emitRunEvent: (event: RunEvent) => void
  ) {}

  formatRunMeta(message: string): string {
    return formatRunMeta(message)
  }

  async create(runId: string): Promise<void> {
    await this.runLogStore.create(runId)
  }

  async appendLine(runId: string, line: string): Promise<void> {
    await this.runLogStore.appendLine(runId, line)
  }

  appendLineNoThrow(runId: string, line: string): void {
    void this.runLogStore.appendLine(runId, line).catch(() => undefined)
  }

  emit(event: RunEvent): void {
    this.emitRunEvent(event)
  }
}

export {
  formatRunMeta,
  SteamCmdLogger
}
