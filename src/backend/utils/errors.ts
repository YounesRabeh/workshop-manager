/**
 * Overview: Defines the backend application error type shared across service and IPC boundaries.
 * Responsibility: Provides a typed `AppError` carrying standardized error codes and user-facing messages.
 */
import type { ApiError, ErrorCode } from '@shared/contracts'

export class AppError extends Error implements ApiError {
  code: ErrorCode

  /** Creates an API error with a stable code and optional diagnostic details. */
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export class RunCancelledError extends AppError {
  readonly cancelled = true

  /** Marks a run as cancelled so callers can distinguish it from a failure. */
  constructor(message = 'SteamCMD run cancelled by user.') {
    super('command_failed', message)
    this.name = 'RunCancelledError'
  }
}

/** Identifies cancellation errors without treating other failures as user cancellation. */
export function isRunCancelledError(error: unknown): error is RunCancelledError {
  return error instanceof RunCancelledError
}
