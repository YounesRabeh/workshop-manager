import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { appMock, state } = vi.hoisted(() => ({
  state: { appDataPath: '' },
  appMock: {
    getPath: vi.fn((name: string) => name === 'appData' ? state.appDataPath : ''),
    setPath: vi.fn()
  }
}))

vi.mock('electron', () => ({ app: appMock }))

import { configureStableUserDataPath, migrateLegacyUserData } from '../../../src/electron/user-data-migration'

describe('user-data migration', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    state.appDataPath = await mkdtemp(join(tmpdir(), 'workshop-app-data-'))
  })

  it('configures the stable user-data directory', () => {
    const stablePath = configureStableUserDataPath()
    expect(stablePath).toBe(join(state.appDataPath, 'workshop-manager'))
    expect(appMock.setPath).toHaveBeenCalledWith('userData', stablePath)
  })

  it('copies missing legacy data recursively without overwriting current data', async () => {
    const stablePath = join(state.appDataPath, 'workshop-manager')
    const legacyPath = join(state.appDataPath, 'Workshop Manager')
    await mkdir(join(stablePath, 'nested'), { recursive: true })
    await mkdir(join(legacyPath, 'nested'), { recursive: true })
    await writeFile(join(stablePath, 'existing.json'), 'current')
    await writeFile(join(legacyPath, 'existing.json'), 'legacy')
    await writeFile(join(legacyPath, 'nested', 'missing.json'), 'copied')

    await migrateLegacyUserData(stablePath)

    expect(await readFile(join(stablePath, 'existing.json'), 'utf8')).toBe('current')
    expect(await readFile(join(stablePath, 'nested', 'missing.json'), 'utf8')).toBe('copied')
  })
})
