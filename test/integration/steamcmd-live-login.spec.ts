import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { RunEvent } from '@shared/contracts'
import { RunLogStore } from '@backend/stores/run-log-store'
import { SteamCmdInstallManager } from '@backend/services/steamcmd-install-manager'
import { SteamCmdRuntimeService } from '@backend/services/steamcmd-runtime-service'
import { AppError } from '@backend/utils/errors'

const liveEnabled = process.env['STEAMCMD_LIVE_TEST'] === '1'
const liveIt = liveEnabled ? it : it.skip

type LiveProfile = 'linux' | 'windows'

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function redact(value: string, secrets: string[]): string {
  return secrets.reduce((sanitized, secret, index) => {
    const label = index === 0 ? 'USERNAME' : index === 1 ? 'PASSWORD' : 'STEAM_GUARD_CODE'
    return sanitized.replace(new RegExp(regexEscape(secret), index === 0 ? 'gi' : 'g'), `[REDACTED_${label}]`)
  }, value)
}

async function wrapWindowsSteamCmdWithWine(executablePath: string): Promise<string> {
  const realExecutablePath = join(dirname(executablePath), 'steamcmd-real.exe')
  await rename(executablePath, realExecutablePath)
  await writeFile(
    executablePath,
    `#!/bin/bash
set -euo pipefail
real_executable="$(dirname "$0")/steamcmd-real.exe"
converted_args=()
convert_script_path=0
for arg in "$@"; do
  if [ "$convert_script_path" = 1 ]; then
    converted_args+=("$(winepath -w "$arg")")
    convert_script_path=0
    continue
  fi
  converted_args+=("$arg")
  if [ "$arg" = "+runscript" ]; then
    convert_script_path=1
  fi
done
exec xvfb-run -a wine "$real_executable" "\${converted_args[@]}"
`,
    'utf8'
  )
  await chmod(executablePath, 0o700)
  return executablePath
}

describe('live Linux SteamCMD login', () => {
  liveIt('installs SteamCMD and reaches an authenticated or Steam Guard state', async () => {
    const secretFile = process.env['STEAMCMD_LIVE_SECRET_FILE']
    const outputDir = process.env['STEAMCMD_LIVE_OUTPUT_DIR']
    if (!secretFile || !outputDir) {
      throw new Error('Live SteamCMD secret and output paths are required')
    }

    const secretLines = (await readFile(secretFile, 'utf8'))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    const credentials = new Map<string, string>()
    for (const line of secretLines) {
      const match = line.match(/^(username|password):\s*(.+)$/i)
      if (!match) {
        throw new Error('Steam credential secret lines must use exact username: and password: labels')
      }
      const key = match[1]!.toLowerCase()
      if (credentials.has(key)) {
        throw new Error(`Steam credential secret contains duplicate ${key}: label`)
      }
      credentials.set(key, match[2]!.trim())
    }

    const username = credentials.get('username') ?? ''
    const password = credentials.get('password') ?? ''
    if (!username || !password) {
      throw new Error('Steam credential secret must contain non-empty username: and password: values')
    }
    const guardFile = process.env['STEAMCMD_LIVE_GUARD_FILE']
    const guardCode = guardFile ? (await readFile(guardFile, 'utf8')).trim().toUpperCase() : ''
    if (guardCode && !/^[A-Z0-9]{5}$/.test(guardCode)) {
      throw new Error('Steam Guard secret must contain exactly five letters or digits')
    }
    const secretsToRedact = [username, password, ...(guardCode ? [guardCode] : [])]

    const requestedProfile = process.env['STEAMCMD_LIVE_PROFILE'] ?? 'linux'
    if (requestedProfile !== 'linux' && requestedProfile !== 'windows') {
      throw new Error('Live SteamCMD profile must be linux or windows')
    }
    const profile = requestedProfile as LiveProfile
    const windowsWine = process.env['STEAMCMD_LIVE_WINDOWS_WINE'] === '1'
    if (profile === 'windows' && process.platform !== 'win32' && !windowsWine) {
      throw new Error('Windows live profile requires native win32 or the explicit Wine compatibility harness')
    }

    const testRoot = join(tmpdir(), `workshop-manager-steamcmd-live-${profile}`)
    const runtimeDir = join(testRoot, 'runtime')
    const logsDir = join(testRoot, 'logs')
    const installManager = new SteamCmdInstallManager(testRoot, profile)
    const installStatus = await installManager.ensureInstalled()
    const executablePath = windowsWine
      ? await wrapWindowsSteamCmdWithWine(installStatus.executablePath)
      : installStatus.executablePath
    const runLogStore = new RunLogStore(logsDir)
    const runtime = new SteamCmdRuntimeService(
      async () => executablePath,
      runLogStore,
      runtimeDir,
      profile
    )
    const executionPolicy = runtime.getExecutionPolicy()
    runtime.setTimeoutSettings({
      loginTimeoutMs: 120_000,
      storedSessionTimeoutMs: 15_000,
      workshopTimeoutMs: 120_000
    })

    let challenge: RunEvent['promptType'] | undefined
    let outcome: 'authenticated' | 'steam_guard_required' | 'failed' = 'failed'
    let failureCode: string | undefined
    let failureMessage: string | undefined
    let guardCodeSubmitted = false
    const startedAt = Date.now()

    runtime.on('run-event', (event: RunEvent) => {
      if (event.type !== 'steam_guard_required') {
        return
      }
      challenge = event.promptType
      if (event.promptType === 'steam_guard_code' && guardCode) {
        guardCodeSubmitted = true
        runtime.submitSteamGuardCode(event.runId, guardCode)
        return
      }
      queueMicrotask(() => runtime.cancelRun(event.runId))
    })

    try {
      await runtime.login(username, password, false, 'otp')
      outcome = 'authenticated'
    } catch (error) {
      if (challenge) {
        outcome = 'steam_guard_required'
      } else {
        failureCode = error instanceof AppError ? error.code : 'unknown'
        failureMessage = error instanceof Error ? error.message : 'Unknown live login error'
      }
    } finally {
      runtime.logout({ clearStoredAuth: true })
    }

    const runs = await runLogStore.list()
    const installLog = await installManager.getInstallLog()
    const sanitizedLines = runs.flatMap((run) => run.lines).map((line) => redact(line, secretsToRedact))
    const report = {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      host: {
        platform: process.platform,
        arch: process.arch,
        node: process.version
      },
      profile,
      compatibilityHost: windowsWine ? 'wine-on-linux' : 'native',
      executionSelection: profile === 'windows'
        ? 'runscript (forced)'
        : executionPolicy.mode === 'script'
          ? 'runscript (explicit)'
          : 'interactive',
      install: {
        installed: installStatus.installed,
        source: installStatus.source,
        executable: profile === 'windows' ? 'steamcmd.exe' : 'steamcmd.sh',
        log: redact(installLog.content, secretsToRedact)
      },
      login: {
        outcome,
        challenge: challenge ?? null,
        guardCodeSubmitted,
        failureCode: failureCode ?? null,
        failureMessage: failureMessage ? redact(failureMessage, secretsToRedact) : null,
        lines: sanitizedLines
      }
    }

    const serialized = `${JSON.stringify(report, null, 2)}\n`
    for (const secret of secretsToRedact) {
      expect(serialized).not.toContain(secret)
    }
    await mkdir(outputDir, { recursive: true })
    await writeFile(join(outputDir, 'steamcmd-live-login.json'), serialized, 'utf8')

    expect(installStatus.installed).toBe(true)
    if (outcome === 'failed') {
      throw new Error(`${profile} SteamCMD login smoke test failed (${failureCode ?? 'unknown'}): ${report.login.failureMessage}`)
    }
    expect(['authenticated', 'steam_guard_required']).toContain(outcome)
  }, 180_000)
})
