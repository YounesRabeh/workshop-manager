/**
 * Overview: Resolves and installs the SteamCMD executable for the backend runtime.
 * Responsibility: Reports install status, supports manual executable overrides,
 *  and performs OS-aware download/extraction when SteamCMD is missing.
 */
import { constants, createWriteStream } from 'node:fs'
import { access, mkdir, readdir, rm, stat } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { get } from 'node:https'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import type { InstallStatus } from '@shared/contracts'
import { AppError } from '@backend/utils/errors'

const STEAMCMD_URLS: Record<NodeJS.Platform, string | undefined> = {
  win32: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip',
  linux: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz',
  darwin: undefined,
  aix: undefined,
  android: undefined,
  cygwin: undefined,
  freebsd: undefined,
  haiku: undefined,
  netbsd: undefined,
  openbsd: undefined,
  sunos: undefined
}

function toInstallError(prefix: string, error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  const message = error instanceof Error ? error.message : String(error)
  return new AppError('install', `${prefix}: ${message}`)
}

function escapePowerShellSingleQuotedValue(value: string): string {
  return value.replace(/'/g, "''")
}

async function isUsableExecutable(path: string): Promise<boolean> {
  try {
    const entry = await stat(path)
    if (!entry.isFile()) {
      return false
    }

    if (process.platform !== 'win32') {
      await access(path, constants.X_OK)
    }

    return true
  } catch {
    return false
  }
}

function expectedExecutableName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'steamcmd.exe' : 'steamcmd.sh'
}

async function findExecutableInDir(
  rootDir: string,
  fileName: string,
  maxDepth: number
): Promise<string | undefined> {
  const normalizedTarget = fileName.toLowerCase()

  async function walk(currentDir: string, depth: number): Promise<string | undefined> {
    let entries
    try {
      entries = await readdir(currentDir, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      return undefined
    }

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue
      }

      if (entry.name.toLowerCase() !== normalizedTarget) {
        continue
      }

      const candidatePath = join(currentDir, entry.name)
      if (await isUsableExecutable(candidatePath)) {
        return candidatePath
      }
    }

    if (depth >= maxDepth) {
      return undefined
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const nested = await walk(join(currentDir, entry.name), depth + 1)
      if (nested) {
        return nested
      }
    }

    return undefined
  }

  return await walk(rootDir, 0)
}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'ignore' })
    child.once('error', (error) => {
      reject(toInstallError('Extraction command failed', error))
    })
    child.once('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new AppError('install', `Extraction command failed: ${command} ${args.join(' ')}`))
    })
  })
}

function download(url: string, targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(targetPath)
    let settled = false
    let activeResponse: IncomingMessage | null = null

    const rejectOnce = (error: AppError) => {
      if (settled) {
        return
      }
      settled = true
      activeResponse?.destroy()
      file.destroy()
      void rm(targetPath, { force: true })
        .catch(() => undefined)
        .finally(() => reject(error))
    }

    const resolveOnce = () => {
      if (settled) {
        return
      }
      settled = true
      resolve()
    }

    file.once('error', (error) => {
      rejectOnce(toInstallError('SteamCMD download failed', error))
    })

    const request = get(url, (res) => {
      activeResponse = res
      if (!res.statusCode || res.statusCode >= 400) {
        res.resume()
        rejectOnce(new AppError('install', `SteamCMD download failed with status ${res.statusCode}`))
        return
      }

      res.once('error', (error) => {
        rejectOnce(toInstallError('SteamCMD download failed', error))
      })

      res.pipe(file)
      file.on('finish', () => {
        file.close((error) => {
          if (error) {
            rejectOnce(toInstallError('SteamCMD download failed', error))
            return
          }
          resolveOnce()
        })
      })
    })

    request.once('error', (error) => {
      rejectOnce(toInstallError('SteamCMD download failed', error))
    })
  })
}

export class SteamCmdInstallManager {
  private manualExecutablePath: string | null = null

  constructor(private readonly rootDir: string) {}

  private get installDir(): string {
    return join(this.rootDir, 'steamcmd')
  }

  get defaultExecutablePath(): string {
    return process.platform === 'win32'
      ? join(this.installDir, 'steamcmd.exe')
      : join(this.installDir, 'steamcmd.sh')
  }

  private async resolveAutoExecutablePath(): Promise<string | undefined> {
    const defaultPath = this.defaultExecutablePath
    if (await isUsableExecutable(defaultPath)) {
      return defaultPath
    }

    return await findExecutableInDir(this.installDir, expectedExecutableName(process.platform), 2)
  }

  setManualExecutablePath(path: string | null | undefined): void {
    const normalizedPath = path?.trim()
    this.manualExecutablePath = normalizedPath && normalizedPath.length > 0 ? normalizedPath : null
  }

  async getStatus(): Promise<InstallStatus> {
    if (this.manualExecutablePath && (await isUsableExecutable(this.manualExecutablePath))) {
      return {
        installed: true,
        executablePath: this.manualExecutablePath,
        source: 'manual'
      }
    }

    const executablePath = await this.resolveAutoExecutablePath()
    if (executablePath) {
      return {
        installed: true,
        executablePath,
        source: 'auto'
      }
    }

    return {
      installed: false,
      executablePath: this.defaultExecutablePath,
      source: 'missing'
    }
  }

  async ensureInstalled(): Promise<InstallStatus> {
    const status = await this.getStatus()
    if (status.installed) {
      return status
    }

    const downloadUrl = STEAMCMD_URLS[process.platform]
    if (!downloadUrl) {
      throw new AppError('install', 'SteamCMD auto-install is unavailable for this OS. Provide manual path.')
    }

    await mkdir(this.installDir, { recursive: true })
    const archivePath = join(this.installDir, process.platform === 'win32' ? 'steamcmd.zip' : 'steamcmd.tar.gz')

    await download(downloadUrl, archivePath)

    if (process.platform === 'win32') {
      const escapedArchivePath = escapePowerShellSingleQuotedValue(archivePath)
      const escapedInstallDir = escapePowerShellSingleQuotedValue(this.installDir)
      await run(
        'powershell',
        [
          '-Command',
          `Expand-Archive -LiteralPath '${escapedArchivePath}' -DestinationPath '${escapedInstallDir}' -Force`
        ],
        this.installDir
      )
    } else {
      await run('tar', ['-xzf', archivePath, '-C', this.installDir], this.installDir)
    }

    await rm(archivePath, { force: true })

    const installedStatus = await this.getStatus()
    if (!installedStatus.installed) {
      throw new AppError('install', 'SteamCMD was downloaded but executable validation failed')
    }

    return installedStatus
  }
}
