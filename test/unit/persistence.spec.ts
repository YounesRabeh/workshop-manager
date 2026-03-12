import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProfileStore } from '../../src/backend/stores/profile-store'
import { RunLogStore } from '../../src/backend/stores/run-log-store'

describe('profile and run-log persistence', () => {
  it('persists profiles and remembered username', async () => {
    const root = await mkdtemp(join(tmpdir(), 'profile-store-'))
    const store = new ProfileStore(join(root, 'profiles.json'))

    await store.saveProfile({
      id: 'p1',
      appId: '480',
      contentFolder: '/mods',
      previewFile: '/mods/preview.png',
      title: 'Profile',
      description: 'Description',
      tags: ['a']
    })
    await store.setRememberedUsername('alice')
    await store.setRememberAuth(true)
    await store.setWebApiEnabled(true)
    await store.setWebApiKeyEncrypted('encrypted-key')

    const profiles = await store.getProfiles()
    expect(profiles).toHaveLength(1)
    expect((await store.getRememberedUsername()) ?? '').toBe('alice')
    expect(await store.getRememberAuth()).toBe(true)
    expect(await store.getWebApiEnabled()).toBe(true)
    expect(await store.getWebApiKeyEncrypted()).toBe('encrypted-key')
  })

  it('stores steamcmd output in a single session file and overwrites it on next run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'run-log-store-'))
    const store = new RunLogStore(join(root, 'runs'))

    await store.create('run-1')
    await store.appendLine('run-1', 'line-a')
    await store.appendLine('run-1', 'line-b')
    await store.finalize('run-1', { success: true, status: 'success', publishedFileId: '123' })

    const read = await store.get('run-1')
    expect(read?.status).toBe('success')
    expect(read?.publishedFileId).toBe('123')
    expect(read?.lines).toContain('line-a')
    expect(read?.logPath.endsWith('steamcmd-output.log')).toBe(true)

    const firstSessionOutput = await readFile(read!.logPath, 'utf8')
    expect(firstSessionOutput).toContain('line-a')
    expect(firstSessionOutput).toContain('line-b')

    await store.create('run-2')
    await store.appendLine('run-2', 'line-c')
    const second = await store.get('run-2')
    const secondSessionOutput = await readFile(second!.logPath, 'utf8')
    expect(secondSessionOutput).toContain('line-c')
    expect(secondSessionOutput).not.toContain('line-a')

    const listed = await store.list()
    expect(listed.map((entry) => entry.runId)).toEqual(['run-2'])
  })
})
