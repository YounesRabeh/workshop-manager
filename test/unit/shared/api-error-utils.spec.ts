import { afterEach, describe, expect, it, vi } from 'vitest'
import { logError, normalizeError } from '@shared/api-error-utils'

describe('api-error-utils', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalVitest = process.env.VITEST
  const originalVitestWorkerId = process.env.VITEST_WORKER_ID
  const originalVitestPoolId = process.env.VITEST_POOL_ID

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    process.env.VITEST = originalVitest
    process.env.VITEST_WORKER_ID = originalVitestWorkerId
    process.env.VITEST_POOL_ID = originalVitestPoolId
  })

  it('normalizes IPC-prefixed coded error strings', () => {
    const normalized = normalizeError("Error invoking remote method 'workshop:login': [auth] Invalid credentials")
    expect(normalized.code).toBe('auth')
    expect(normalized.message).toBe('Invalid credentials')
  })

  it('normalizes objects with direct code/message fields', () => {
    const normalized = normalizeError({ code: 'timeout', message: 'Too slow' })
    expect(normalized).toMatchObject({
      code: 'timeout',
      message: 'Too slow'
    })
  })

  it('normalizes nested causes with code/message fields', () => {
    const normalized = normalizeError({
      cause: {
        code: 'install',
        message: 'SteamCMD not found'
      }
    })
    expect(normalized).toMatchObject({
      code: 'install',
      message: 'SteamCMD not found'
    })
  })

  it('falls back for non-error values', () => {
    const normalized = normalizeError(42)
    expect(normalized).toMatchObject({
      code: 'command_failed',
      message: 'Unexpected error'
    })
  })

  it('logs context with normalized payload outside test mode', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.VITEST
    delete process.env.VITEST_WORKER_ID
    delete process.env.VITEST_POOL_ID

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logError('test::context', { code: 'auth', message: 'Failed' })
    expect(consoleSpy).toHaveBeenCalledWith('[test::context] auth: Failed', undefined)
    consoleSpy.mockRestore()
  })

  it('does not log when running in test mode', () => {
    process.env.NODE_ENV = 'test'
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logError('test::context', { code: 'auth', message: 'Failed' })
    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
