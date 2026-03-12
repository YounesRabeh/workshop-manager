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

function createFakeChild(lines: string[], exitCode = 0): EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  stdin: PassThrough
  kill: () => void
} {
  const emitter = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    stdin: PassThrough
    kill: () => void
  }

  emitter.stdout = new PassThrough()
  emitter.stderr = new PassThrough()
  emitter.stdin = new PassThrough()
  emitter.kill = () => undefined

  queueMicrotask(() => {
    for (const line of lines) {
      emitter.stdout.write(`${line}\n`)
    }
    emitter.emit('close', exitCode)
  })

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
      createFakeChild(['Published File Id: 777'])
    )

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, join(root, 'runtime'))
    await runtime.login('alice', 'secret')

    const result = await runtime.upload(
      {
        appId: '480',
        contentFolder: '/mods',
        previewFile: '/mods/preview.png',
        title: 'My Mod',
        description: 'Desc',
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

  it('creates runtime directory before login spawn', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-login-'))
    const runtimeDir = join(root, 'runtime')
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createFakeChild(['Logged in OK'])
    )

    const runtime = new SteamCmdRuntimeService(async () => '/usr/bin/steamcmd', store, runtimeDir)
    await runtime.login('alice', 'secret')

    await expect(access(runtimeDir)).resolves.toBeUndefined()
  })

  it('combines web api + community results with full item metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-service-workshop-'))
    const store = new RunLogStore(join(root, 'runs'))

    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      createFakeChild(["Logging in user 'alice' [U:1:42] to Steam Public..."])
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
