/**
 * Overview: Manages ephemeral SteamCMD script files used with `+runscript`.
 * Responsibility: Creates secure temp scripts, executes caller-provided work
 * against the script path, and guarantees deterministic cleanup.
 */
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '@backend/utils/errors'

interface RunWithEphemeralScriptOptions<T> {
  runId: string
  scriptContent: string
  execute: (scriptPath: string) => Promise<T>
}

class SteamCmdScriptRunner {
  constructor(private readonly runtimeDir: string) {}

  private scriptsDirPath(): string {
    return join(this.runtimeDir, 'scripts')
  }

  private async ensurePrivateScriptsDir(): Promise<string> {
    const scriptsDir = this.scriptsDirPath()
    await mkdir(scriptsDir, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') {
      await chmod(scriptsDir, 0o700)
    }
    return scriptsDir
  }

  async purgeStaleScripts(): Promise<number> {
    const scriptsDir = this.scriptsDirPath()
    let entries
    try {
      entries = await readdir(scriptsDir, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      return 0
    }

    const scriptFileNames = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
      .map((entry) => entry.name)

    await Promise.all(scriptFileNames.map((name) => rm(join(scriptsDir, name), { force: true })))
    return scriptFileNames.length
  }

  async runWithEphemeralScript<T>(options: RunWithEphemeralScriptOptions<T>): Promise<T> {
    const runId = options.runId.trim()
    if (!runId) {
      throw new AppError('validation', 'runId is required for SteamCMD script execution')
    }

    const scriptContent = options.scriptContent
    if (!scriptContent.trim()) {
      throw new AppError('validation', 'SteamCMD script content is empty')
    }

    const scriptsDir = await this.ensurePrivateScriptsDir()
    const fileName = `${runId}.${randomUUID().replace(/-/g, '')}.txt`
    const scriptPath = join(scriptsDir, fileName)

    await writeFile(scriptPath, scriptContent, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx'
    })
    if (process.platform !== 'win32') {
      await chmod(scriptPath, 0o600)
    }

    try {
      return await options.execute(scriptPath)
    } finally {
      await rm(scriptPath, { force: true })
    }
  }
}

export {
  SteamCmdScriptRunner
}

