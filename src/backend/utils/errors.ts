import type { ApiError, ErrorCode } from '@shared/contracts'

export class AppError extends Error implements ApiError {
  code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
}
