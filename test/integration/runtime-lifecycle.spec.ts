import { access, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RunLogStore } from '../../src/backend/stores/run-log-store'
import { SteamCmdRuntimeService } from '../../src/backend/services/steamcmd-runtime-service'

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

function createInteractiveFakeChild(scenario: InteractiveScenario): EventEmitter & {
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
      emitter.commands.push(command)
      if (command.startsWith('login ')) {
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

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'))
    await runtime.login('alice', 'secret')

    const result = await runtime.upload(
      {
        appId: '480',
        contentFolder: '/mods',
        previewFile: '/mods/preview.png',
        title: 'My Mod',
        tags: ['tag-a']
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

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'))
    await runtime.login('alice', 'secret')

    const result = await runtime.upload(
      {
        appId: '480',
        publishedFileId: '123',
        contentFolder: '',
        previewFile: '/mods/preview.png',
        title: 'My Mod',
        tags: []
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

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'))
    await runtime.login('alice', 'secret')

    await expect(
      runtime.upload(
        {
          appId: '480',
          publishedFileId: '123',
          contentFolder: '',
          previewFile: '/mods/preview.png',
          title: 'My Mod',
          tags: []
        },
        'update'
      )
    ).rejects.toThrow(
      'Steam upload timed out while sending the manifest. Retry in a minute and check network/Steam service status.'
    )
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

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, runtimeDir)
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

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'))
    await runtime.login('alice', 'secret')
    runtime.logout()

    const restored = await runtime.login('alice', '', true)
    const persisted = await store.get(restored.sessionId)

    expect(persisted?.lines.join('\n')).toContain('restored active SteamCMD session without re-running login command')
    expect(childRef?.commands.filter((command) => command.startsWith('login '))).toHaveLength(1)
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

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'))
    await runtime.login('alice', 'secret')

    await expect(
      runtime.upload(
        {
          appId: '480',
          publishedFileId: '123',
          contentFolder: emptyContentFolder,
          previewFile: '',
          title: '',
          tags: []
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

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'))
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
      const items = await runtime.getMyWorkshopItems(undefined, 'dev-key', true)

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
