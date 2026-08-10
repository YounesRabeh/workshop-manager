import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSteamCmdLoginScript, buildSteamCmdWorkshopScript } from '@backend/services/steamcmd-script-builder'
import { SteamCmdScriptRunner } from '@backend/services/steamcmd-script-runner'
import {
  getSteamCmdPlatformBehavior,
  resolveSteamCmdPlatformProfile,
  type SteamCmdPlatformProfile
} from '@backend/services/steamcmd-platform-profile'

interface ProbeResult {
  platform: NodeJS.Platform
  argv: string[]
  stdinHex: string
  stdinUtf8: string
}

async function readUtf8(stream: NodeJS.ReadableStream): Promise<string> {
  let output = ''
  for await (const chunk of stream) {
    output += Buffer.from(chunk).toString('utf8')
  }
  return output
}

async function runProbe(args: string[], input = ''): Promise<ProbeResult> {
  const probePath = resolve('test/fixtures/steamcmd-process-probe.mjs')
  const child = spawn(process.execPath, [probePath, ...args], {
    stdio: 'pipe',
    shell: false,
    windowsHide: true
  })
  const stdoutPromise = readUtf8(child.stdout)
  const stderrPromise = readUtf8(child.stderr)
  child.stdin.end(input)

  const [[exitCode], stdout, stderr] = await Promise.all([
    once(child, 'close') as Promise<[number | null]>,
    stdoutPromise,
    stderrPromise
  ])
  if (exitCode !== 0) {
    throw new Error(stderr || `process probe exited with code ${exitCode ?? 1}`)
  }
  try {
    return JSON.parse(stdout) as ProbeResult
  } catch (error) {
    throw new Error(
      `process probe returned invalid JSON from ${process.execPath}: ${stdout || '<empty>'}; stderr=${stderr || '<empty>'}`,
      { cause: error }
    )
  }
}

function configuredProfile(): SteamCmdPlatformProfile {
  const requested = process.env['STEAMCMD_CONTRACT_PROFILE']
  if (requested === 'linux' || requested === 'windows') {
    return requested
  }
  return resolveSteamCmdPlatformProfile()
}

describe('native SteamCMD command contract', () => {
  it('preserves argv boundaries, script lines, and interactive line endings', async () => {
    const profile = configuredProfile()
    const nativeProfile = resolveSteamCmdPlatformProfile()
    expect(profile).toBe(nativeProfile)

    const behavior = getSteamCmdPlatformBehavior(profile)
    const runtimeDir = join(tmpdir(), `workshop manager contract ${profile}`)
    const scriptRunner = new SteamCmdScriptRunner(runtimeDir)
    const loginScript = buildSteamCmdLoginScript({ username: 'contract-user' })
    const workshopScript = buildSteamCmdWorkshopScript({
      username: 'contract-user',
      vdfPath: join(runtimeDir, 'item with spaces.vdf')
    })

    let observedScriptPath = ''
    let observedScriptBytes = Buffer.alloc(0)
    const argvProbe = await scriptRunner.runWithEphemeralScript({
      runId: 'contract-run',
      scriptContent: workshopScript,
      execute: async (scriptPath) => {
        observedScriptPath = scriptPath
        observedScriptBytes = await readFile(scriptPath)
        return await runProbe(['+runscript', scriptPath])
      }
    })

    const interactiveInput = ['login contract-user', 'quit', ''].join(behavior.interactiveLineEnding)
    const stdinProbe = await runProbe(['--read-stdin'], interactiveInput)
    const expectedLineEndingHex = Buffer.from(behavior.interactiveLineEnding).toString('hex')

    expect(argvProbe.platform).toBe(process.platform)
    expect(argvProbe.argv).toEqual(['+runscript', observedScriptPath])
    expect(observedScriptBytes.toString('utf8')).toBe(workshopScript)
    expect(observedScriptBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false)
    expect(stdinProbe.stdinHex).toContain(expectedLineEndingHex)
    expect(loginScript.split('\n').filter(Boolean)).toEqual([
      '@ShutdownOnFailedCommand 1',
      '@NoPromptForPassword 1',
      'login contract-user',
      'quit'
    ])

    const outputDir = process.env['STEAMCMD_CONTRACT_OUTPUT_DIR']
    if (outputDir) {
      await mkdir(outputDir, { recursive: true })
      const report = {
        generatedAt: new Date().toISOString(),
        host: {
          platform: process.platform,
          arch: process.arch,
          node: process.version
        },
        profile,
        executable: behavior.expectedExecutableName,
        executionSelection: profile === 'windows'
          ? 'runscript (forced by the Windows profile)'
          : 'interactive (default; runscript when STEAMCMD_EXECUTION_MODE=script)',
        oneShotInvocation: {
          argvSent: ['+runscript', '<ephemeral-script-path>'],
          argvObserved: ['+runscript', '<ephemeral-script-path>'],
          shell: behavior.useShellHost,
          windowsHide: behavior.hideWindowsConsole
        },
        runScript: {
          encoding: 'utf8-without-bom',
          lineEnding: workshopScript.includes('\r\n') ? 'CRLF' : 'LF',
          lines: workshopScript.split(/\r?\n/).filter(Boolean)
        },
        interactiveCompatibilityMode: {
          lineEnding: behavior.interactiveLineEnding === '\r\n' ? 'CRLF' : 'LF',
          stdinHex: stdinProbe.stdinHex
        }
      }
      await writeFile(
        join(outputDir, 'steamcmd-command-contract.json'),
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8'
      )
    }
  })
})
