import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProfileStore } from '@backend/stores/profile-store'
import { RunLogStore } from '@backend/stores/run-log-store'

describe('profile and run-log persistence', () => {
  it('persists profiles and remembered username', async () => {
    const root = await mkdtemp(join(tmpdir(), 'profile-store-'))
    const store = new ProfileStore(join(root, 'profiles.json'))

    await store.saveProfile({
      id: 'p1',
      appId: '480',
      contentFolder: '/mods',
      previewFile: '/mods/preview.png',
      title: 'Profile'
    })
    await store.setRememberedUsername('alice')
    await store.setRememberAuth(true)
    await store.setWebApiEnabled(true)
    await store.setWebApiKeyEncrypted('encrypted-key')
    await store.setSteamCmdManualPath('/tools/steamcmd.sh')

    const profiles = await store.getProfiles()
    expect(profiles).toHaveLength(1)
    expect((await store.getRememberedUsername()) ?? '').toBe('alice')
    expect(await store.getRememberAuth()).toBe(true)
    expect(await store.getWebApiEnabled()).toBe(true)
    expect(await store.getWebApiKeyEncrypted()).toBe('encrypted-key')
    expect(await store.getSteamCmdManualPath()).toBe('/tools/steamcmd.sh')
  })

  it('backs up malformed profile data and recreates a clean database', async () => {
    const root = await mkdtemp(join(tmpdir(), 'profile-store-corrupt-'))
    const dbPath = join(root, 'profiles.json')
    const store = new ProfileStore(dbPath)

    await writeFile(dbPath, '{"profiles": [', 'utf8')

    expect(await store.getProfiles()).toEqual([])

    const entries = await readdir(root)
    const backupName = entries.find((entry) => /^profiles\.corrupt\.\d+\.json$/.test(entry))
    expect(backupName).toBeDefined()
    expect(await readFile(join(root, backupName!), 'utf8')).toBe('{"profiles": [')
    expect(JSON.parse(await readFile(dbPath, 'utf8'))).toEqual({ profiles: [] })
  })

  it('serializes concurrent profile and preference updates without dropping fields', async () => {
    const root = await mkdtemp(join(tmpdir(), 'profile-store-concurrent-'))
    const dbPath = join(root, 'profiles.json')
    const store = new ProfileStore(dbPath)

    await Promise.all([
      store.saveProfile({
        id: 'p1',
        appId: '480',
        contentFolder: '/mods',
        previewFile: '/mods/preview.png',
        title: 'Concurrent Profile'
      }),
      store.setRememberedLoginState({
        rememberedUsername: 'TheYuyuBoy',
        rememberAuth: true
      }),
      store.setAdvancedSettingsState({
        webApiEnabled: true,
        webApiKeyEncrypted: 'encrypted-key',
        steamCmdManualPath: '/tools/steamcmd.sh'
      })
    ])

    expect(await store.getProfiles()).toHaveLength(1)
    expect(await store.getRememberedUsername()).toBe('TheYuyuBoy')
    expect(await store.getRememberAuth()).toBe(true)
    expect(await store.getWebApiEnabled()).toBe(true)
    expect(await store.getWebApiKeyEncrypted()).toBe('encrypted-key')
    expect(await store.getSteamCmdManualPath()).toBe('/tools/steamcmd.sh')
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
    await store.finalize('run-2', { success: true, status: 'success' })
    const second = await store.get('run-2')
    const secondSessionOutput = await readFile(second!.logPath, 'utf8')
    expect(secondSessionOutput).toContain('line-c')
    expect(secondSessionOutput).not.toContain('line-a')

    const listed = await store.list()
    expect(listed.map((entry) => entry.runId)).toEqual(['run-2'])
  })
})
