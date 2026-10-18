/**
 * Overview: Shared helpers for parsing and logging errors across renderer and backend layers.
 * Responsibility: Normalizes unknown error shapes into stable code/message pairs and emits
 * development-only diagnostics without changing user-facing copy.
 */
import type { ApiError, ErrorCode } from './contracts'

export interface NormalizedError {
  code: string
  message: string
  originalError?: Error
}

const KNOWN_ERROR_CODES = new Set<ErrorCode>([
  'validation',
  'install',
  'auth',
  'steam_guard',
  'command_failed',
  'timeout'
])

/** Maps known API error codes to the stable set exposed to callers. */
function normalizeCode(code: unknown): string {
  if (typeof code !== 'string') {
    return 'command_failed'
  }
  const normalized = code.trim().toLowerCase()
  return normalized.length > 0 ? normalized : 'command_failed'
}

/** Extracts an error code prefix and readable message from a serialized IPC error. */
function extractFromMessage(input: string): { code?: string; message: string } {
  const withoutIpcPrefix = input.replace(/^Error invoking remote method '[^']+':\s*/i, '').trim()
  const normalized = withoutIpcPrefix.replace(/^Error:\s*/i, '').trim()
  const coded = normalized.match(/^\[([a-z_]+)\]\s*(.*)$/i)
  if (coded) {
    const normalizedCode = normalizeCode(coded[1])
    const normalizedMessage = coded[2].trim()
    return {
      code: KNOWN_ERROR_CODES.has(normalizedCode as ErrorCode) ? normalizedCode : normalizedCode,
      message: normalizedMessage || 'Unexpected error'
    }
  }

  return {
    message: normalized || 'Unexpected error'
  }
}

/** Converts strings, objects, and thrown values into a consistent API error. */
export function normalizeError(error: unknown): NormalizedError {
  const fallback: NormalizedError = {
    code: 'command_failed',
    message: 'Unexpected error'
  }

  if (!error) {
    return fallback
  }

  if (typeof error === 'string') {
    const parsed = extractFromMessage(error)
    return {
      code: normalizeCode(parsed.code ?? fallback.code),
      message: parsed.message
    }
  }

  if (error instanceof Error) {
    const parsed = extractFromMessage(error.message)
    return {
      code: normalizeCode(parsed.code ?? fallback.code),
      message: parsed.message,
      originalError: error
    }
  }

  if (typeof error !== 'object') {
    return fallback
  }

  const maybe = error as Partial<ApiError> & { cause?: unknown }
  if (typeof maybe.message === 'string' && typeof maybe.code === 'string') {
    const parsed = extractFromMessage(maybe.message)
    return {
      code: normalizeCode(parsed.code ?? maybe.code),
      message: parsed.message
    }
  }

  if (maybe.cause && typeof maybe.cause === 'object') {
    const nested = maybe.cause as Partial<ApiError>
    if (typeof nested.message === 'string' && typeof nested.code === 'string') {
      const parsed = extractFromMessage(nested.message)
      return {
        code: normalizeCode(parsed.code ?? nested.code),
        message: parsed.message
      }
    }
  }

  return fallback
}

/** Recognizes messages asking the user to configure SteamCMD. */
export function isSteamCmdMissingConfigurationMessage(message: string): boolean {
  return (
    /steamcmd/i.test(message) &&
    /(not found|not configured|missing|no such file|cannot find|executable|path)/i.test(message)
  )
}

/** Reads the process environment when running in Node, if it is available. */
function readProcessEnv(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
}

/** Checks whether the current process is running under a test runner. */
function isTestEnvironment(env: Record<string, string | undefined>): boolean {
  return (
    env.NODE_ENV === 'test' ||
    env.VITEST === 'true' ||
    typeof env.VITEST_WORKER_ID === 'string' ||
    typeof env.VITEST_POOL_ID === 'string'
  )
}

/** Determines whether log errors applies in the current environment. */
function shouldLogErrors(): boolean {
  const env = readProcessEnv()
  if (env.NODE_ENV === 'production') {
    return false
  }
  if (isTestEnvironment(env)) {
    return false
  }
  return true
}

/** Logs an error with its normalized code and message without throwing. */
export function logError(context: string, error: NormalizedError): void {
  if (!shouldLogErrors()) {
    return
  }

  // Keep console logging lightweight and consistent across renderer/backend.
  // eslint-disable-next-line no-console
  console.error(`[${context}] ${error.code}: ${error.message}`, error.originalError)
}
