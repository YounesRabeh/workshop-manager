/**
 * Overview: Shared helpers for registering Electron IPC handlers with consistent error translation.
 * Responsibility: Wraps `ipcMain.handle` callbacks and normalizes thrown errors into renderer-safe IPC errors.
 */
import { ipcMain } from 'electron'
import { AppError } from '@backend/utils/errors'

function toPlainError(error: unknown): { message: string; code: string } {
  if (error instanceof AppError) {
    return { message: error.message, code: error.code }
  }
  if (error instanceof Error) {
    return { message: error.message, code: 'command_failed' }
  }
  return { message: 'Unknown error', code: 'command_failed' }
}

export function toIpcError(error: unknown): Error {
  const plain = toPlainError(error)
  const wrapped = new Error(`[${plain.code}] ${plain.message}`)
  ;(wrapped as Error & { code?: string }).code = plain.code
  return wrapped
}

export function handleIpc<Args extends unknown[], Result>(
  channel: string,
  handler: (...args: Args) => Promise<Result> | Result
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await handler(...(args as Args))
    } catch (error) {
      throw toIpcError(error)
    }
  })
}
