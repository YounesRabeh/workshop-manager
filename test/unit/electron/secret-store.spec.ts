import { beforeEach, describe, expect, it, vi } from 'vitest'

const { safeStorageMock } = vi.hoisted(() => ({
  safeStorageMock: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  }
}))

vi.mock('electron', () => ({ safeStorage: safeStorageMock }))

import { decryptSecret, encryptSecret, isSecureStorageAvailable } from '../../../src/electron/secret-store'

describe('secret storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
  })

  it('encrypts and decrypts values through Electron safeStorage', () => {
    safeStorageMock.encryptString.mockReturnValue(Buffer.from('ciphertext'))
    safeStorageMock.decryptString.mockReturnValue('plain-secret')

    expect(encryptSecret('plain-secret')).toBe(Buffer.from('ciphertext').toString('base64'))
    expect(decryptSecret(Buffer.from('ciphertext').toString('base64'))).toBe('plain-secret')
    expect(safeStorageMock.encryptString).toHaveBeenCalledWith('plain-secret')
  })

  it('fails safely when encryption is unavailable or ciphertext is invalid', () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false)
    expect(isSecureStorageAvailable()).toBe(false)
    expect(() => encryptSecret('secret')).toThrow('Secure storage is unavailable')

    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    safeStorageMock.decryptString.mockImplementation(() => { throw new Error('corrupt') })
    expect(() => decryptSecret('bad')).toThrow('Saved Steam Web API key is unreadable')
  })

  it('treats safeStorage availability errors as unavailable', () => {
    safeStorageMock.isEncryptionAvailable.mockImplementation(() => { throw new Error('not initialized') })
    expect(isSecureStorageAvailable()).toBe(false)
  })
})
