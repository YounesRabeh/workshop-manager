import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RunResult } from '@shared/contracts'

export interface PersistedRunLog extends RunResult {
  lines: string[]
  status: 'running' | 'success' | 'failed' | 'cancelled'
}

export class RunLogStore {
  private writeChains = new Map<string, Promise<void>>()

  constructor(private readonly logsDir: string) {}

  private getPath(runId: string): string {
    return join(this.logsDir, `${runId}.json`)
  }

  async create(runId: string): Promise<PersistedRunLog> {
    const log: PersistedRunLog = {
      runId,
      success: false,
      steamOutputSummary: '',
      logPath: this.getPath(runId),
      lines: [],
      status: 'running'
    }
    await this.withRunLock(runId, async () => {
      await this.write(log)
    })
    return log
  }

  async appendLine(runId: string, line: string): Promise<void> {
    await this.withRunLock(runId, async () => {
      const current = (await this.get(runId)) ?? {
        runId,
        success: false,
        steamOutputSummary: '',
        logPath: this.getPath(runId),
        lines: [],
        status: 'running' as const
      }

      current.lines.push(line)
      current.steamOutputSummary = current.lines.slice(-25).join('\n')
      await this.write(current)
    })
  }

  async finalize(runId: string, update: Partial<PersistedRunLog>): Promise<PersistedRunLog> {
    let merged!: PersistedRunLog
    await this.withRunLock(runId, async () => {
      const current = (await this.get(runId)) ?? {
        runId,
        success: false,
        steamOutputSummary: '',
        logPath: this.getPath(runId),
        lines: [],
        status: 'running' as const
      }

      merged = {
        ...current,
        ...update,
        runId,
        logPath: this.getPath(runId)
      }
      await this.write(merged)
    })
    return merged
  }

  async get(runId: string): Promise<PersistedRunLog | null> {
    try {
      const data = await readFile(this.getPath(runId), 'utf8')
      return JSON.parse(data) as PersistedRunLog
    } catch {
      return null
    }
  }

  async list(): Promise<PersistedRunLog[]> {
    await mkdir(this.logsDir, { recursive: true })
    const files = await readdir(this.logsDir)
    const logs = await Promise.all(
      files
        .filter((name) => name.endsWith('.json'))
        .map(async (name) => {
          const content = await readFile(join(this.logsDir, name), 'utf8')
          return JSON.parse(content) as PersistedRunLog
        })
    )

    return logs.sort((a, b) => b.runId.localeCompare(a.runId))
  }

  private async write(log: PersistedRunLog): Promise<void> {
    await mkdir(dirname(this.getPath(log.runId)), { recursive: true })
    await writeFile(this.getPath(log.runId), `${JSON.stringify(log, null, 2)}\n`, 'utf8')
  }

  private async withRunLock(runId: string, operation: () => Promise<void>): Promise<void> {
    const current = this.writeChains.get(runId) ?? Promise.resolve()
    const next = current.then(operation)
    this.writeChains.set(runId, next.catch(() => undefined))
    await next
  }
}
