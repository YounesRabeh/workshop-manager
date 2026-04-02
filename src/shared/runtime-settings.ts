/**
 * Overview: Shared timeout defaults and normalization helpers for SteamCMD runtime settings.
 * Responsibility: Defines persisted timeout-setting shapes, sane defaults, and bounded normalization used by both frontend and backend.
 */
export interface SteamCmdTimeoutSettings {
  loginTimeoutMs: number
  storedSessionTimeoutMs: number
  workshopTimeoutMs: number
}

export const STEAMCMD_TIMEOUT_DISABLED_VALUE = 0

type TimeoutKey = keyof SteamCmdTimeoutSettings

interface TimeoutFieldDefinition {
  defaultValue: number
  min: number
  max: number
}

const TIMEOUT_FIELD_DEFINITIONS: Record<TimeoutKey, TimeoutFieldDefinition> = {
  loginTimeoutMs: {
    defaultValue: 30_000,
    min: 5_000,
    max: 180_000
  },
  storedSessionTimeoutMs: {
    defaultValue: 10_000,
    min: 3_000,
    max: 60_000
  },
  workshopTimeoutMs: {
    defaultValue: 60_000,
    min: 15_000,
    max: 600_000
  }
}

export const DEFAULT_STEAMCMD_TIMEOUT_SETTINGS: SteamCmdTimeoutSettings = {
  loginTimeoutMs: TIMEOUT_FIELD_DEFINITIONS.loginTimeoutMs.defaultValue,
  storedSessionTimeoutMs: TIMEOUT_FIELD_DEFINITIONS.storedSessionTimeoutMs.defaultValue,
  workshopTimeoutMs: TIMEOUT_FIELD_DEFINITIONS.workshopTimeoutMs.defaultValue
}

export const STEAMCMD_TIMEOUT_LIMITS = {
  loginTimeoutMs: {
    min: TIMEOUT_FIELD_DEFINITIONS.loginTimeoutMs.min,
    max: TIMEOUT_FIELD_DEFINITIONS.loginTimeoutMs.max
  },
  storedSessionTimeoutMs: {
    min: TIMEOUT_FIELD_DEFINITIONS.storedSessionTimeoutMs.min,
    max: TIMEOUT_FIELD_DEFINITIONS.storedSessionTimeoutMs.max
  },
  workshopTimeoutMs: {
    min: TIMEOUT_FIELD_DEFINITIONS.workshopTimeoutMs.min,
    max: TIMEOUT_FIELD_DEFINITIONS.workshopTimeoutMs.max
  }
} as const

function normalizeTimeoutField(key: TimeoutKey, value: unknown): number {
  const { defaultValue, min, max } = TIMEOUT_FIELD_DEFINITIONS[key]
  const normalized =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN

  if (!Number.isFinite(normalized)) {
    return defaultValue
  }

  if (normalized === STEAMCMD_TIMEOUT_DISABLED_VALUE) {
    return STEAMCMD_TIMEOUT_DISABLED_VALUE
  }

  return Math.min(max, Math.max(min, Math.round(normalized)))
}

export function normalizeSteamCmdTimeoutSettings(
  input?: Partial<SteamCmdTimeoutSettings> | null
): SteamCmdTimeoutSettings {
  return {
    loginTimeoutMs: normalizeTimeoutField('loginTimeoutMs', input?.loginTimeoutMs),
    storedSessionTimeoutMs: normalizeTimeoutField('storedSessionTimeoutMs', input?.storedSessionTimeoutMs),
    workshopTimeoutMs: normalizeTimeoutField('workshopTimeoutMs', input?.workshopTimeoutMs)
  }
}
