import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/user/data') } }))

import { getAppPaths } from '@backend/services/app/path-provider'

describe('application path provider', () => {
  it('keeps all persisted and temporary data under Electron userData', () => {
    expect(getAppPaths()).toEqual({
      dataDir: '/user/data',
      profilesPath: '/user/data/profiles.json',
      runLogsDir: '/user/data/runs',
      runtimeDir: '/user/data/runtime'
    })
  })
})
