/**
 * Overview: steamcmd-install-manager.ts module in backend/services.
 * Responsibility: Holds the primary logic/exports for this area of the app.
 */
import { createWriteStream } from 'node:fs'
import { access, mkdir, rm } from 'node:fs/promises'
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'ignore' })
    child.once('error', reject)
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
    get(url, (res) => {
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new AppError('install', `SteamCMD download failed with status ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }).on('error', reject)
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

  setManualExecutablePath(path: string): void {
    this.manualExecutablePath = path
  }

  async getStatus(): Promise<InstallStatus> {
    if (this.manualExecutablePath && (await exists(this.manualExecutablePath))) {
      return {
        installed: true,
        executablePath: this.manualExecutablePath,
        source: 'manual'
      }
    }

    const executablePath = this.defaultExecutablePath
    if (await exists(executablePath)) {
      return {
        installed: true,
        executablePath,
        source: 'auto'
      }
    }

    return {
      installed: false,
      executablePath,
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
      await run('powershell', ['-Command', `Expand-Archive -Path '${archivePath}' -DestinationPath '${this.installDir}' -Force`], this.installDir)
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
