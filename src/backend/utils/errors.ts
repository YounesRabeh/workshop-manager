/**
 * Overview: errors.ts module in backend/utils.
 * Responsibility: Holds the primary logic/exports for this area of the app.
 */
import type { ApiError, ErrorCode } from '@shared/contracts'

export class AppError extends Error implements ApiError {
  code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
}
