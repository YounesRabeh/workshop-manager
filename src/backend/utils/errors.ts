/**
 * Overview: Defines the backend application error type shared across service and IPC boundaries.
 * Responsibility: Provides a typed `AppError` carrying standardized error codes and user-facing messages.
 */
import type { ApiError, ErrorCode } from '@shared/contracts'

export class AppError extends Error implements ApiError {
  code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
}
