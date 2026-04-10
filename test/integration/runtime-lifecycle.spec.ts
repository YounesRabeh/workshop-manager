import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RunLogStore } from '../../src/backend/stores/run-log-store'
import { SteamCmdRuntimeService } from '../../src/backend/services/steamcmd-runtime-service'
import { AppError } from '../../src/backend/utils/errors'

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn()
  }
})

import { spawn } from 'node:child_process'

interface InteractiveResponse {
  lines: string[]
  closeCode?: number
}

interface InteractiveScenario {
  login?: InteractiveResponse
  workshopBuild?: InteractiveResponse
  logout?: InteractiveResponse
}

interface InteractiveChildOptions {
  emitInitialPrompt?: boolean
  requireReadyPromptBeforeCommands?: boolean
  ignoredLoginDispatches?: number
  startupResponse?: InteractiveResponse
}

function createInteractiveFakeChild(scenario: InteractiveScenario): EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  stdin: PassThrough
  commands: string[]
  kill: () => void
}
function createInteractiveFakeChild(
  scenario: InteractiveScenario,
  options: InteractiveChildOptions
): EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  stdin: PassThrough
  commands: string[]
  kill: () => void
}
function createInteractiveFakeChild(
  scenario: InteractiveScenario,
  options: InteractiveChildOptions = {}
): EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  stdin: PassThrough
  commands: string[]
  kill: () => void
} {
  const emitter = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    stdin: PassThrough
    commands: string[]
    kill: () => void
  }

  emitter.stdout = new PassThrough()
  emitter.stderr = new PassThrough()
  emitter.stdin = new PassThrough()
  emitter.commands = []
  let stdinBuffer = ''
  let closed = false
  let readyForCommands = options.requireReadyPromptBeforeCommands !== true
  let ignoredLoginDispatches = options.ignoredLoginDispatches ?? 0

  const emitLines = (response: InteractiveResponse | undefined) => {
    if (!response || closed) {
      return
    }
    queueMicrotask(() => {
      for (const line of response.lines) {
        emitter.stdout.write(`${line}\n`)
      }
      if (typeof response.closeCode === 'number') {
        closed = true
        emitter.emit('close', response.closeCode)
      }
    })
  }

  emitter.stdin.on('data', (chunk: Buffer) => {
    stdinBuffer += chunk.toString('utf8')
    const commands = stdinBuffer.split(/\r?\n/)
    stdinBuffer = commands.pop() ?? ''

    for (const rawCommand of commands) {
      const command = rawCommand.trim()
      if (!command) {
        continue
      }
      if (!readyForCommands) {
        continue
      }
      emitter.commands.push(command)
      if (command.startsWith('login ')) {
        if (ignoredLoginDispatches > 0) {
          ignoredLoginDispatches -= 1
          continue
        }
        emitLines(scenario.login)
        continue
      }
      if (command.startsWith('workshop_build_item ')) {
        emitLines(scenario.workshopBuild)
        continue
      }
      if (command === 'logout') {
        emitLines(scenario.logout)
      }
    }
  })

  emitter.kill = () => {
    if (closed) {
      return
    }
    closed = true
    emitter.emit('close', 0)
  }

  if (options.emitInitialPrompt) {
    queueMicrotask(() => {
      if (closed) {
        return
      }
      emitter.stdout.write('Steam>')
      readyForCommands = true
    })
  }

  if (options.startupResponse) {
    emitLines(options.startupResponse)
  }

  return emitter
}

function createOneShotFakeChild(response: InteractiveResponse): EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  stdin: PassThrough
  commands: string[]
  kill: () => void
} {
  const emitter = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    stdin: PassThrough
    commands: string[]
    kill: () => void
  }

  emitter.stdout = new PassThrough()
  emitter.stderr = new PassThrough()
  emitter.stdin = new PassThrough()
  emitter.commands = []
  let closed = false
  let stdinBuffer = ''

  emitter.stdin.on('data', (chunk: Buffer) => {
    stdinBuffer += chunk.toString('utf8')
    const commands = stdinBuffer.split(/\r?\n/)
    stdinBuffer = commands.pop() ?? ''

    for (const rawCommand of commands) {
      const command = rawCommand.trim()
      if (command) {
        emitter.commands.push(command)
      }
    }
  })

  queueMicrotask(() => {
    if (closed) {
      return
    }
    for (const line of response.lines) {
      emitter.stdout.write(`${line}\n`)
    }
    closed = true
    emitter.emit('close', response.closeCode ?? 0)
  })

  emitter.kill = () => {
    if (closed) {
      return
    }
    closed = true
    emitter.emit('close', 0)
  }

  return emitter
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

describe('SteamCmdRuntimeService lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('streams output and persists successful run logs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createInteractiveFakeChild({
        login: {
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for user info...OK'
          ]
        },
        workshopBuild: {
          lines: ['Published File Id: 777', 'Success.']
        }
      })
    )

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'), 'linux')
    await runtime.login('alice', 'secret')

    const result = await runtime.upload(
      {
        appId: '480',
        contentFolder: '/mods',
        previewFile: '/mods/preview.png',
        title: 'My Mod',
        changenote: 'Initial release notes'
      },
      'upload'
    )

    expect(result.success).toBe(true)
    expect(result.publishedFileId).toBe('777')

    const persisted = await store.get(result.runId)
    const listed = await store.list()
    const match = listed.find((item) => item.runId === result.runId)

    expect(match?.success ?? persisted?.success).toBe(true)
    expect((persisted?.lines.join('\n') ?? '') || (match?.lines.join('\n') ?? '')).toMatch(
      /Published File Id/i
    )
  })

  it('keeps benign IPC latency warnings in logs while update succeeds', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-benign-warning-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createInteractiveFakeChild({
        login: {
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for user info...OK'
          ]
        },
        workshopBuild: {
          lines: [
            'Preparing update...',
            'Uploading content...',
            'IPC function call IClientUGC::GetItemUpdateProgress took too long: 43 msec',
            'Success.'
          ]
        }
      })
    )

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'), 'linux')
    await runtime.login('alice', 'secret')

    const result = await runtime.upload(
      {
        appId: '480',
        publishedFileId: '123',
        contentFolder: '',
        previewFile: '/mods/preview.png',
        title: 'My Mod'
      },
      'update'
    )

    expect(result.success).toBe(true)
    const persisted = await store.get(result.runId)
    expect(persisted?.lines.join('\n')).toContain(
      'IPC function call IClientUGC::GetItemUpdateProgress took too long: 43 msec'
    )
  })

  it('returns specific transient failure message for manifest timeout during update', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-manifest-timeout-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createInteractiveFakeChild({
        login: {
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for user info...OK'
          ]
        },
        workshopBuild: {
          lines: [
            'Preparing update...',
            'Uploading content...',
            '[2026-03-12 22:01:45]: ERROR! Timeout uploading manifest (size 967)',
            'ERROR! Failed to update workshop item (Failure).'
          ]
        }
      })
    )

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'), 'linux')
    await runtime.login('alice', 'secret')

    await expect(
      runtime.upload(
        {
          appId: '480',
          publishedFileId: '123',
          contentFolder: '',
          previewFile: '/mods/preview.png',
          title: 'My Mod'
        },
        'update'
      )
    ).rejects.toThrow(
      'Steam upload timed out while sending the manifest. Retry in a minute and check network/Steam service status.'
    )
  })

  it('restores workshop auth after a timed-out update invalidates the interactive session', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-timeout-restore-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
      createInteractiveFakeChild({
        login: {
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for user info...OK'
          ]
        }
      })
    )

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'), 'linux')
    await runtime.login('alice', 'secret')

    const processSession = (
      runtime as unknown as {
        processSession: {
          run: ReturnType<typeof vi.fn>
          hasPersistentProcess: ReturnType<typeof vi.fn>
        }
        loginState: { username: string; steamId64?: string } | null
      }
    ).processSession

    vi.spyOn(processSession, 'hasPersistentProcess').mockReturnValue(false)
    const runSpy = vi
      .spyOn(processSession, 'run')
      .mockImplementationOnce(async () => {
        ;(runtime as unknown as { loginState: { username: string; steamId64?: string } | null }).loginState = null
        throw new AppError('timeout', 'SteamCMD run exceeded timeout (60000ms)')
      })
      .mockResolvedValueOnce({
        lines: [
          "Logging in user 'alice' [U:1:42] to Steam Public...",
          'Waiting for user info...OK'
        ],
        exitCode: 0
      })
      .mockResolvedValueOnce({
        lines: ['Published File Id: 123', 'Success.'],
        exitCode: 0
      })

    await expect(
      runtime.upload(
        {
          appId: '480',
          publishedFileId: '123',
          contentFolder: '',
          previewFile: '/mods/preview.png',
          title: 'My Mod'
        },
        'update'
      )
    ).rejects.toThrow('SteamCMD run exceeded timeout (60000ms)')

    await expect(
      runtime.upload(
        {
          appId: '480',
          publishedFileId: '123',
          contentFolder: '',
          previewFile: '/mods/preview.png',
          title: 'My Mod'
        },
        'update'
      )
    ).resolves.toMatchObject({
      success: true,
      publishedFileId: '123'
    })

    expect(runSpy).toHaveBeenCalledTimes(3)
    expect(runSpy.mock.calls[1]?.[2]).toMatchObject({
      phase: 'login',
      timeoutMs: 10_000
    })
    expect(runSpy.mock.calls[2]?.[2]).toMatchObject({
      phase: 'update',
      timeoutMs: 60_000
    })
  })

  it('creates runtime directory before login spawn', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-login-'))
    const runtimeDir = join(root, 'runtime')
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createInteractiveFakeChild({
        login: {
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for user info...OK'
          ]
        }
      })
    )

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, runtimeDir, 'linux')
    await runtime.login('alice', 'secret')

    await expect(access(runtimeDir)).resolves.toBeUndefined()
  })

  it('restores active session after UI sign-out without re-running Steam login', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-restore-session-'))
    const store = new RunLogStore(join(root, 'runs'))

    let childRef:
      | (EventEmitter & {
          stdout: PassThrough
          stderr: PassThrough
          stdin: PassThrough
          commands: string[]
          kill: () => void
        })
      | undefined
    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      childRef = createInteractiveFakeChild({
        login: {
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for user info...OK'
          ]
        }
      })
      return childRef
    })

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'), 'linux')
    await runtime.login('alice', 'secret')
    runtime.logout()

    const restored = await runtime.login('alice', '', true)
    const persisted = await store.get(restored.sessionId)

    expect(persisted?.lines.join('\n')).toContain('restored active SteamCMD session without re-running login command')
    expect(childRef?.commands.filter((command) => command.startsWith('login '))).toHaveLength(1)
  })

  it('uses a single one-shot Windows login without restoring a persistent workshop session', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-win32-login-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_command: string, args: string[]) => {
      if (args.join(' ') === '+login alice secret +quit') {
        return createOneShotFakeChild({
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for confirmation on your Steam Guard Mobile Authenticator...',
            'Waiting for user info...OK'
          ]
        })
      }

      throw new Error(`Unexpected spawn args: ${args.join(' ')}`)
    })

    const runtime = new SteamCmdRuntimeService(
      async () => 'C:\\steamcmd\\steamcmd.exe',
      store,
      join(root, 'runtime'),
      'windows'
    )
    await runtime.login('alice', 'secret')

    expect(spawn).toHaveBeenNthCalledWith(
      1,
      'C:\\steamcmd\\steamcmd.exe',
      ['+login', 'alice', 'secret', '+quit'],
      expect.objectContaining({ shell: false, windowsHide: true })
    )
    expect(spawn).toHaveBeenCalledTimes(1)
    const persisted = await store.list()
    expect(persisted[0]?.lines.join('\n')).toContain('Waiting for confirmation on your Steam Guard Mobile Authenticator...')
  })

  it('accepts Windows one-shot login success when output reaches waiting for client config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-win32-client-config-login-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_command: string, args: string[]) => {
      if (args.join(' ') === '+login alice secret +quit') {
        return createOneShotFakeChild({
          lines: [
            "Logging in using username/password.",
            "Logging in user 'alice' to Steam Public...OK",
            'Waiting for client config...OK'
          ],
          closeCode: 0
        })
      }

      throw new Error(`Unexpected spawn args: ${args.join(' ')}`)
    })

    const runtime = new SteamCmdRuntimeService(
      async () => 'C:\\steamcmd\\steamcmd.exe',
      store,
      join(root, 'runtime'),
      'windows'
    )

    await expect(runtime.login('alice', 'secret')).resolves.toEqual(expect.objectContaining({ sessionId: expect.any(String) }))
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('accepts Windows one-shot login success when login user line ends with OK', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-win32-login-user-ok-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_command: string, args: string[]) => {
      if (args.join(' ') === '+login alice secret +quit') {
        return createOneShotFakeChild({
          lines: ["Logging in user 'alice' to Steam Public...OK"],
          closeCode: 0
        })
      }

      throw new Error(`Unexpected spawn args: ${args.join(' ')}`)
    })

    const runtime = new SteamCmdRuntimeService(
      async () => 'C:\\steamcmd\\steamcmd.exe',
      store,
      join(root, 'runtime'),
      'windows'
    )

    await expect(runtime.login('alice', 'secret')).resolves.toEqual(expect.objectContaining({ sessionId: expect.any(String) }))
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('keeps Windows login state available for workshop fetches after a one-shot login', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-win32-workshop-fetch-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_command: string, args: string[]) => {
      if (args.join(' ') === '+login alice secret +quit') {
        return createOneShotFakeChild({
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for user info...OK'
          ]
        })
      }

      throw new Error(`Unexpected spawn args: ${args.join(' ')}`)
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.includes('/myworkshopfiles/')) {
        return new Response(
          '<html><body><a href="https://steamcommunity.com/sharedfiles/filedetails/?id=100">Mod</a></body></html>',
          { status: 200, headers: { 'content-type': 'text/html' } }
        )
      }

      if (url === 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/') {
        expect(init?.method).toBe('POST')
        return jsonResponse({
          response: {
            publishedfiledetails: [
              {
                publishedfileid: '100',
                title: 'Fetched item',
                consumer_appid: '480',
                visibility: 0,
                time_updated: 10
              }
            ]
          }
        })
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    const runtime = new SteamCmdRuntimeService(
      async () => 'C:\\steamcmd\\steamcmd.exe',
      store,
      join(root, 'runtime'),
      'windows'
    )
    await runtime.login('alice', 'secret')

    const items = await runtime.getMyWorkshopItems(undefined, undefined, {
      allowWebApi: false,
      webApiAccess: 'disabled'
    })

    expect(items).toHaveLength(1)
    expect(items[0]?.publishedFileId).toBe('100')
    expect(spawn).toHaveBeenCalledTimes(1)
    fetchSpy.mockRestore()
  })

  it('uses one-shot Windows workshop commands after login', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-win32-workshop-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_command: string, args: string[]) => {
      if (args.join(' ') === '+login alice secret +quit') {
        return createOneShotFakeChild({
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for confirmation on your Steam Guard Mobile Authenticator...',
            'Waiting for user info...OK'
          ]
        })
      }

      if (args.includes('+workshop_build_item')) {
        return createOneShotFakeChild({
          lines: ['Published File Id: 777', 'Success.']
        })
      }

      throw new Error(`Unexpected spawn args: ${args.join(' ')}`)
    })

    const runtime = new SteamCmdRuntimeService(
      async () => 'C:\\steamcmd\\steamcmd.exe',
      store,
      join(root, 'runtime'),
      'windows'
    )
    await runtime.login('alice', 'secret')

    const result = await runtime.upload(
      {
        appId: '480',
        contentFolder: '/mods',
        previewFile: '/mods/preview.png',
        title: 'My Mod'
      },
      'upload'
    )

    expect(result.success).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(2)
    const uploadArgs = vi.mocked(spawn).mock.calls[1]?.[1]
    expect(uploadArgs).toEqual(
      expect.arrayContaining(['+login', 'alice', '+workshop_build_item', '+quit'])
    )
    expect(vi.mocked(spawn).mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({ shell: false, windowsHide: true })
    )
  })

  it('accepts a successful Windows one-shot workshop run even when SteamCMD omits an explicit success line', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-win32-workshop-no-success-line-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_command: string, args: string[]) => {
      if (args.join(' ') === '+login alice secret +quit') {
        return createOneShotFakeChild({
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for user info...OK'
          ]
        })
      }

      if (args.includes('+workshop_build_item')) {
        return createOneShotFakeChild({
          lines: ['Published File Id: 777']
        })
      }

      throw new Error(`Unexpected spawn args: ${args.join(' ')}`)
    })

    const runtime = new SteamCmdRuntimeService(
      async () => 'C:\\steamcmd\\steamcmd.exe',
      store,
      join(root, 'runtime'),
      'windows'
    )
    await runtime.login('alice', 'secret')

    const result = await runtime.upload(
      {
        appId: '480',
        contentFolder: '/mods',
        previewFile: '/mods/preview.png',
        title: 'My Mod'
      },
      'upload'
    )

    expect(result.success).toBe(true)
    expect(result.publishedFileId).toBe('777')
  })

  it('resolves the Windows steamId64 from SteamCMD connection logs when output only reports [U:1:0]', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-win32-identity-'))
    const store = new RunLogStore(join(root, 'runs'))
    const runtimeDir = join(root, 'runtime')
    await mkdir(join(runtimeDir, 'logs'), { recursive: true })
    await writeFile(join(runtimeDir, 'logs', 'connection_log.txt'), 'SetSteamID( [U:1:42] )\n', 'utf8')

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_command: string, args: string[]) => {
      if (args.join(' ') === '+login alice secret +quit') {
        return createOneShotFakeChild({
          lines: [
            "Logging in user 'alice' [U:1:0] to Steam Public...",
            'Waiting for user info...OK'
          ]
        })
      }

      throw new Error(`Unexpected spawn args: ${args.join(' ')}`)
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.includes('IPublishedFileService/GetUserFiles')) {
        const parsed = new URL(url)
        expect(parsed.searchParams.get('steamid')).toBe('76561197960265770')

        return jsonResponse({
          response: {
            publishedfiledetails: [
              {
                publishedfileid: '100',
                title: 'Resolved item',
                consumer_appid: '480',
                visibility: 0,
                time_updated: 10
              }
            ]
          }
        })
      }

      if (url.includes('/myworkshopfiles/')) {
        return new Response('<html><body>No items here</body></html>', { status: 200 })
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    const runtime = new SteamCmdRuntimeService(
      async () => 'C:\\steamcmd\\steamcmd.exe',
      store,
      runtimeDir,
      'windows'
    )
    await runtime.login('alice', 'secret')

    const items = await runtime.getMyWorkshopItems(undefined, 'api-key', {
      allowWebApi: true,
      webApiAccess: 'active'
    })

    expect(items).toHaveLength(1)
    expect(items[0]?.publishedFileId).toBe('100')
    expect(fetchSpy).not.toHaveBeenCalledWith('https://steamcommunity.com/id/alice/?xml=1')

    const persisted = await store.list()
    expect(persisted[0]?.lines.join('\n')).toContain('resolved steamId64 via SteamCMD connection log')
    expect(spawn).toHaveBeenCalledTimes(1)
    fetchSpy.mockRestore()
  })

  it('marks cancelled uploads as cancelled without emitting a conflicting run_failed event', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-cancel-upload-'))
    const store = new RunLogStore(join(root, 'runs'))
    const events: string[] = []
    let resolveUploadReady!: (runId: string) => void
    const uploadReadyPromise = new Promise<string>((resolve) => {
      resolveUploadReady = resolve
    })

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createInteractiveFakeChild({
        login: {
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for user info...OK'
          ]
        },
        workshopBuild: {
          lines: ['Preparing upload...']
        }
      })
    )

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'), 'linux')
    runtime.on('run-event', (event) => {
      if (event.type === 'phase_changed' || event.type === 'run_started' || event.type === 'run_failed' || event.type === 'run_cancelled') {
        events.push(`${event.type}:${event.runId}`)
      }
      if (event.type === 'stdout' && event.phase === 'upload') {
        resolveUploadReady(event.runId)
      }
    })

    await runtime.login('alice', 'secret')

    const uploadPromise = runtime.upload(
      {
        appId: '480',
        contentFolder: '/mods',
        previewFile: '/mods/preview.png',
        title: 'My Mod'
      },
      'upload'
    )

    const runId = await uploadReadyPromise

    runtime.cancelRun(runId)

    await expect(uploadPromise).rejects.toThrow('SteamCMD run cancelled by user.')

    const persisted = await store.get(runId)
    expect(persisted?.status).toBe('cancelled')
    expect(events).toContain(`run_cancelled:${runId}`)
    expect(events).not.toContain(`run_failed:${runId}`)
  })

  it('clears pending Steam Guard prompts when a login run is cancelled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-cancel-login-'))
    const store = new RunLogStore(join(root, 'runs'))
    let resolveSessionId!: (runId: string) => void
    let resolveGuardPrompt!: () => void
    const sessionIdPromise = new Promise<string>((resolve) => {
      resolveSessionId = resolve
    })
    const guardPromptPromise = new Promise<void>((resolve) => {
      resolveGuardPrompt = resolve
    })

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createInteractiveFakeChild({
        login: {
          lines: ['Steam Guard code:']
        }
      })
    )

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'), 'linux')
    runtime.on('run-event', (event) => {
      if (event.type === 'run_started' && event.phase === 'login') {
        resolveSessionId(event.runId)
      }
      if (event.type === 'steam_guard_required' && event.phase === 'login') {
        resolveGuardPrompt()
      }
    })

    const loginPromise = runtime.login('alice', 'secret')
    const sessionId = await sessionIdPromise
    await guardPromptPromise

    runtime.cancelRun(sessionId)

    await expect(loginPromise).rejects.toThrow('SteamCMD run cancelled by user.')
    expect(() => runtime.submitSteamGuardCode(sessionId, '12345')).toThrow(
      'No Steam Guard prompt is currently waiting for this session'
    )
  })

  it('submits Steam Guard code as a login command when SteamCMD shows usage prompt format', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-guard-usage-'))
    const store = new RunLogStore(join(root, 'runs'))

    let childRef:
      | (EventEmitter & {
          stdout: PassThrough
          stderr: PassThrough
          stdin: PassThrough
          commands: string[]
          kill: () => void
        })
      | undefined
    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      childRef = createInteractiveFakeChild({
        login: {
          lines: [
            'Usage:',
            '\tlogin <username> [<password>] [<Steam guard code>]',
            'Steam>'
          ]
        }
      })
      return childRef
    })

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'), 'linux')
    let sessionId = ''
    let guardPromptSeen = false

    runtime.on('run-event', (event) => {
      if (event.type === 'run_started' && event.phase === 'login') {
        sessionId = event.runId
      }
      if (event.type === 'steam_guard_required' && event.phase === 'login') {
        guardPromptSeen = true
      }
    })

    const loginPromise = runtime.login('alice', 'secret')

    await vi.waitFor(() => {
      expect(guardPromptSeen).toBe(true)
      expect(sessionId).not.toBe('')
    })

    runtime.submitSteamGuardCode(sessionId, '12345')

    await vi.waitFor(() => {
      const loginCommands = childRef?.commands.filter((command) => command.startsWith('login ')) ?? []
      expect(loginCommands).toContain('login alice secret 12345')
    })

    runtime.cancelRun(sessionId)
    await expect(loginPromise).rejects.toThrow('SteamCMD run cancelled by user.')
  })

  it('fails Windows bad credentials login without attempting a second bootstrap', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-win32-auth-failure-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation((_command: string, args: string[]) => {
      if (args.join(' ') === '+login alice wrong +quit') {
        return createOneShotFakeChild({
          lines: [
            "Logging in user 'alice' to Steam Public...",
            'Login Failure: BadCredentials'
          ],
          closeCode: 1
        })
      }

      throw new Error(`Unexpected spawn args: ${args.join(' ')}`)
    })

    const runtime = new SteamCmdRuntimeService(
      async () => 'C:\\steamcmd\\steamcmd.exe',
      store,
      join(root, 'runtime'),
      'windows'
    )

    await expect(runtime.login('alice', 'wrong')).rejects.toThrow(
      'Steam login failed: username or password is incorrect.'
    )

    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledWith(
      'C:\\steamcmd\\steamcmd.exe',
      ['+login', 'alice', 'wrong', '+quit'],
      expect.objectContaining({ shell: false, windowsHide: true })
    )
  })

  it('fails update early when selected content folder has no files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-empty-folder-'))
    const store = new RunLogStore(join(root, 'runs'))
    const emptyContentFolder = await mkdtemp(join(root, 'empty-content-'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createInteractiveFakeChild({
        login: {
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for user info...OK'
          ]
        }
      })
    )

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'), 'linux')
    await runtime.login('alice', 'secret')

    await expect(
      runtime.upload(
        {
          appId: '480',
          publishedFileId: '123',
          contentFolder: emptyContentFolder,
          previewFile: '',
          title: 'My Mod'
        },
        'update'
      )
    ).rejects.toThrow('Selected content folder is empty. Add files or use preview-only update.')
  })

  it('combines web api + community results with full item metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-workshop-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createInteractiveFakeChild({
        login: {
          lines: [
            "Logging in user 'alice' [U:1:42] to Steam Public...",
            'Waiting for user info...OK'
          ]
        }
      })
    )

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'), 'linux')
    await runtime.login('alice', 'secret')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.includes('IPublishedFileService/GetUserFiles')) {
        const parsed = new URL(url)
        const privacy = parsed.searchParams.get('privacy')

        if (privacy === null) {
          return jsonResponse({
            response: {
              publishedfiledetails: [
                {
                  publishedfileid: '100',
                  title: 'Public Any',
                  consumer_appid: '480',
                  visibility: 0,
                  time_updated: 100,
                  preview_url: 'https://img/pub-any.png'
                }
              ]
            }
          })
        }

        if (privacy === '1') {
          return jsonResponse({
            response: {
              publishedfiledetails: [
                {
                  publishedfileid: '300',
                  title: 'Friends Item',
                  consumer_app_id: 570,
                  visibility: 1,
                  time_updated: 90,
                  preview_url: 'https://img/friends.png'
                }
              ]
            }
          })
        }

        if (privacy === '2') {
          return jsonResponse({
            response: {
              publishedfiledetails: [
                {
                  publishedfileid: '200',
                  title: 'Hidden Item',
                  creator_app_id: 255710,
                  visibility: 2,
                  time_updated: 120,
                  preview_url: 'https://img/hidden.png'
                }
              ]
            }
          })
        }

        if (privacy === '3') {
          return jsonResponse({
            response: {
              publishedfiledetails: [
                {
                  publishedfileid: '400',
                  title: 'Unlisted Item',
                  creator_appid: '730',
                  visibility: 3,
                  time_updated: 80,
                  preview_url: 'https://img/unlisted.png'
                }
              ]
            }
          })
        }

        return jsonResponse({
          response: { publishedfiledetails: [] }
        })
      }

      if (url.includes('/myworkshopfiles/')) {
        return new Response(
          `
          <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=100">A</a>
          <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=500">B</a>
          `,
          { status: 200, headers: { 'content-type': 'text/html' } }
        )
      }

      if (url.includes('ISteamRemoteStorage/GetPublishedFileDetails')) {
        return jsonResponse({
          response: {
            publishedfiledetails: [
              {
                publishedfileid: '100',
                title: 'Public Community Newer',
                consumer_app_id: 480,
                visibility: 0,
                time_updated: 150,
                preview_url: 'https://img/pub-community.png'
              },
              {
                publishedfileid: '500',
                title: 'Community Only',
                consumer_app_id: 620,
                visibility: 0,
                time_updated: 50,
                preview_url: 'https://img/community-only.png'
              }
            ]
          }
        })
      }

      return new Response('not found', { status: 404 })
    })

    try {
      const items = await runtime.getMyWorkshopItems(undefined, 'dev-key', { allowWebApi: true })

      expect(items).toHaveLength(5)
      expect(items.map((item) => item.publishedFileId)).toEqual(['100', '200', '300', '400', '500'])

      const byId = new Map(items.map((item) => [item.publishedFileId, item]))

      expect(byId.get('100')).toMatchObject({
        title: 'Public Community Newer',
        appId: '480',
        visibility: 0,
        updatedAt: 150,
        previewUrl: 'https://img/pub-community.png'
      })
      expect(byId.get('200')).toMatchObject({
        title: 'Hidden Item',
        appId: '255710',
        visibility: 2,
        updatedAt: 120,
        previewUrl: 'https://img/hidden.png'
      })
      expect(byId.get('300')).toMatchObject({
        title: 'Friends Item',
        appId: '570',
        visibility: 1,
        updatedAt: 90,
        previewUrl: 'https://img/friends.png'
      })
      expect(byId.get('400')).toMatchObject({
        title: 'Unlisted Item',
        appId: '730',
        visibility: 3,
        updatedAt: 80,
        previewUrl: 'https://img/unlisted.png'
      })
      expect(byId.get('500')).toMatchObject({
        title: 'Community Only',
        appId: '620',
        visibility: 0,
        updatedAt: 50,
        previewUrl: 'https://img/community-only.png'
      })

      const privacyModes = fetchSpy.mock.calls
        .map(([input]) => (typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url))
        .filter((url) => url.includes('IPublishedFileService/GetUserFiles'))
        .map((url) => new URL(url).searchParams.get('privacy'))

      expect(privacyModes).toEqual([null, '0', '1', '2', '3', '4'])
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
