/**
 * Overview: Safe-storage wrapper for encrypting and decrypting persisted secrets in Electron.
 * Responsibility: Checks secure storage availability and converts secret-storage failures into app-level errors.
 */
import { safeStorage } from 'electron'
import { AppError } from '@backend/utils/errors'

export function isSecureStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function encryptSecret(value: string): string {
  if (!isSecureStorageAvailable()) {
    throw new AppError(
      'command_failed',
      'Secure storage is unavailable on this system. Steam Web API key cannot be saved securely.'
    )
  }
  return safeStorage.encryptString(value).toString('base64')
}

export function decryptSecret(value: string): string {
  if (!isSecureStorageAvailable()) {
    throw new AppError(
      'command_failed',
      'Secure storage is unavailable on this system. Saved Steam Web API key cannot be unlocked.'
    )
  }
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    throw new AppError(
      'command_failed',
      'Saved Steam Web API key is unreadable. Re-enter it in Advanced Options.'
    )
  }
}
