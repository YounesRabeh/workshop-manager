import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@backend/utils/errors'

const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: { handle: handleMock } }))

import { handleIpc, toIpcError } from '../../../src/electron/ipc-helpers'

describe('Electron IPC helpers', () => {
  beforeEach(() => handleMock.mockReset())

  it('registers handlers, forwards arguments, and returns results', async () => {
    const handler = vi.fn((left: number, right: number) => left + right)
    handleIpc('sum', handler)
    const registered = handleMock.mock.calls[0]?.[1] as (_event: unknown, ...args: unknown[]) => Promise<unknown>

    await expect(registered({}, 2, 3)).resolves.toBe(5)
    expect(handler).toHaveBeenCalledWith(2, 3)
  })

  it('preserves AppError codes and sanitizes unknown failures', async () => {
    expect(toIpcError(new AppError('validation', 'bad input'))).toMatchObject({
      message: '[validation] bad input',
      code: 'validation'
    })
    expect(toIpcError('broken')).toMatchObject({
      message: '[command_failed] Unknown error',
      code: 'command_failed'
    })

    handleIpc('failure', () => { throw new AppError('auth', 'login required') })
    const registered = handleMock.mock.calls[0]?.[1] as (_event: unknown) => Promise<unknown>
    await expect(registered({})).rejects.toMatchObject({ code: 'auth' })
  })
})
