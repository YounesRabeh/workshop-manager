/**
 * Store Overview
 *
 * `ProfileStore` owns the local JSON database for Workshop profiles and
 * user preferences that need to survive app restarts. The file is intentionally
 * small and human-readable because it stores configuration-style state rather
 * than high-volume runtime output.
 *
 * Persisted state:
 * - Workshop mod profiles.
 * - Remembered login preferences and the preferred Steam Guard auth mode.
 * - Steam Web API enablement plus the encrypted API key payload.
 * - Manual SteamCMD path overrides.
 * - SteamCMD timeout settings.
 *
 * Operational guarantees:
 * - Missing databases read as an empty default database.
 * - Writes are serialized through `writeChain` so concurrent callers do not
 *   interleave read-modify-write cycles.
 * - Each write is committed by writing a temp file and renaming it into place.
 * - Invalid JSON or an invalid root schema is preserved as a
 *   `*.corrupt.<timestamp>.json` sibling before the store resets to defaults.
 * - Stored timeout values are normalized on read/write, including migration
 *   from the legacy login-timeout-only default.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'
import type { ModProfile, PreferredAuthMode } from '@shared/contracts'
import type { SteamCmdTimeoutSettings } from '@shared/runtime-settings'
import { normalizeSteamCmdTimeoutSettings } from '@shared/runtime-settings'

/**
 * Version-tolerant shape of the on-disk JSON document.
 *
 * Fields other than `profiles` are optional so databases written by older app
 * versions can still be loaded and normalized by the current store.
 */
interface ProfileDb {
  rememberedUsername?: string
  rememberAuth?: boolean
  preferredAuthMode?: PreferredAuthMode
  webApiEnabled?: boolean
  webApiKeyEncrypted?: string
  steamCmdManualPath?: string
  loginTimeoutMs?: number
  storedSessionTimeoutMs?: number
  workshopTimeoutMs?: number
  profiles: ModProfile[]
}

/**
 * Older builds persisted only `loginTimeoutMs` with this value. When the other
 * timeout fields are absent, this sentinel lets the store rewrite all timeout
 * settings to the current normalized defaults.
 */
const LEGACY_LOGIN_TIMEOUT_DEFAULT_MS = 30_000

const DEFAULT_DB: ProfileDb = {
  profiles: []
}

/**
 * Distinguishes recoverable profile database shape errors from unexpected
 * runtime errors such as permission failures.
 */
class CorruptProfileDbError extends Error {}

function cloneDefaultDb(): ProfileDb {
  return {
    profiles: [...DEFAULT_DB.profiles]
  }
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === code)
}

function normalizeDb(parsed: unknown): ProfileDb {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CorruptProfileDbError('Profile database root must be an object.')
  }

  const record = parsed as Partial<ProfileDb>
  if (!Array.isArray(record.profiles)) {
    throw new CorruptProfileDbError('Profile database is missing a valid profiles array.')
  }

  return {
    profiles: record.profiles,
    rememberedUsername: record.rememberedUsername,
    rememberAuth: record.rememberAuth,
    preferredAuthMode: normalizePreferredAuthMode(record.preferredAuthMode),
    webApiEnabled: record.webApiEnabled,
    webApiKeyEncrypted: record.webApiKeyEncrypted,
    steamCmdManualPath: record.steamCmdManualPath,
    loginTimeoutMs: record.loginTimeoutMs,
    storedSessionTimeoutMs: record.storedSessionTimeoutMs,
    workshopTimeoutMs: record.workshopTimeoutMs
  }
}

function normalizePreferredAuthMode(value: unknown): PreferredAuthMode | undefined {
  if (value === 'otp' || value === 'steam_guard_mobile') {
    return value
  }
  return undefined
}

/**
 * JSON-backed persistence adapter for user profile and preference state.
 *
 * The store keeps file IO details behind small async methods so Electron IPC
 * handlers can work with domain objects instead of on-disk JSON mechanics.
 */
export class ProfileStore {
  private writeChain: Promise<void> = Promise.resolve()

  /**
   * @param dbPath Absolute path to the JSON database file managed by this store.
   */
  constructor(private readonly dbPath: string) {}

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(operation, operation)
    this.writeChain = next.then(
      () => undefined,
      () => undefined
    )
    return await next
  }

  private async recoverCorruptDb(originalBytes: string): Promise<ProfileDb> {
    await mkdir(dirname(this.dbPath), { recursive: true })
    const parsedPath = parse(this.dbPath)
    const corruptPath = join(parsedPath.dir, `${parsedPath.name}.corrupt.${Date.now()}${parsedPath.ext}`)
    await writeFile(corruptPath, originalBytes, 'utf8')
    const defaultDb = cloneDefaultDb()
    await this.writeDbFile(defaultDb)
    return defaultDb
  }

  private async readDbUnlocked(): Promise<ProfileDb> {
    try {
      const data = await readFile(this.dbPath, 'utf8')
      try {
        return normalizeDb(JSON.parse(data))
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof CorruptProfileDbError) {
          return await this.recoverCorruptDb(data)
        }
        throw error
      }
    } catch (error) {
      if (isNodeErrorWithCode(error, 'ENOENT')) {
        return cloneDefaultDb()
      }
      throw error
    }
  }

  private async readDb(): Promise<ProfileDb> {
    await this.writeChain
    return await this.readDbUnlocked()
  }

  private async writeDbFile(db: ProfileDb): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true })
    const tempPath = `${this.dbPath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tempPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8')
    await rename(tempPath, this.dbPath)
  }

  private async updateDb<T>(mutate: (db: ProfileDb) => T | Promise<T>): Promise<T> {
    return await this.withWriteLock(async () => {
      const db = await this.readDbUnlocked()
      const result = await mutate(db)
      await this.writeDbFile(db)
      return result
    })
  }

  /**
   * Returns all saved Workshop profiles in their persisted order.
   */
  async getProfiles(): Promise<ModProfile[]> {
    const db = await this.readDb()
    return db.profiles
  }

  /**
   * Inserts a new profile or replaces the existing profile with the same ID.
   *
   * The provided object is persisted as-is; validation is expected to happen at
   * the IPC or form boundary before the store is called.
   */
  async saveProfile(profile: ModProfile): Promise<ModProfile> {
    return await this.updateDb(async (db) => {
      const existingIndex = db.profiles.findIndex((item) => item.id === profile.id)

      if (existingIndex >= 0) {
        db.profiles[existingIndex] = profile
      } else {
        db.profiles.push(profile)
      }

      return profile
    })
  }

  /**
   * Removes a profile by ID. Missing IDs are treated as a no-op.
   */
  async deleteProfile(profileId: string): Promise<void> {
    await this.updateDb(async (db) => {
      db.profiles = db.profiles.filter((item) => item.id !== profileId)
    })
  }

  /**
   * Returns the username saved for the login form, if the user opted to keep it.
   */
  async getRememberedUsername(): Promise<string | undefined> {
    const db = await this.readDb()
    return db.rememberedUsername
  }

  /**
   * Updates the saved login username. Passing `undefined` clears it.
   */
  async setRememberedUsername(username: string | undefined): Promise<void> {
    await this.updateDb(async (db) => {
      db.rememberedUsername = username
    })
  }

  /**
   * Returns whether auth/session preferences should be remembered.
   */
  async getRememberAuth(): Promise<boolean> {
    const db = await this.readDb()
    return db.rememberAuth === true
  }

  /**
   * Returns the preferred Steam Guard prompt mode, defaulting to OTP for older
   * databases or unrecognized values.
   */
  async getPreferredAuthMode(): Promise<PreferredAuthMode> {
    const db = await this.readDb()
    return db.preferredAuthMode === 'steam_guard_mobile' ? 'steam_guard_mobile' : 'otp'
  }

  /**
   * Updates whether auth/session preferences should be remembered.
   */
  async setRememberAuth(enabled: boolean): Promise<void> {
    await this.updateDb(async (db) => {
      db.rememberAuth = enabled
    })
  }

  /**
   * Stores the preferred Steam Guard prompt mode.
   */
  async setPreferredAuthMode(mode: PreferredAuthMode): Promise<void> {
    await this.updateDb(async (db) => {
      db.preferredAuthMode = mode
    })
  }

  /**
   * Saves all login preference fields together so the login UI cannot observe a
   * partially updated remembered-login state.
   */
  async setRememberedLoginState(input: {
    rememberedUsername: string | undefined
    rememberAuth: boolean
    preferredAuthMode?: PreferredAuthMode
  }): Promise<void> {
    await this.updateDb(async (db) => {
      db.rememberedUsername = input.rememberedUsername
      db.rememberAuth = input.rememberAuth
      db.preferredAuthMode = normalizePreferredAuthMode(input.preferredAuthMode) ?? 'otp'
    })
  }

  /**
   * Returns whether Workshop metadata lookups should use the Steam Web API.
   */
  async getWebApiEnabled(): Promise<boolean> {
    const db = await this.readDb()
    return db.webApiEnabled === true
  }

  /**
   * Updates whether Workshop metadata lookups should use the Steam Web API.
   */
  async setWebApiEnabled(enabled: boolean): Promise<void> {
    await this.updateDb(async (db) => {
      db.webApiEnabled = enabled
    })
  }

  /**
   * Returns the encrypted Steam Web API key payload, if one has been saved.
   */
  async getWebApiKeyEncrypted(): Promise<string | undefined> {
    const db = await this.readDb()
    return db.webApiKeyEncrypted
  }

  /**
   * Stores the encrypted Steam Web API key payload. Passing `undefined` clears it.
   */
  async setWebApiKeyEncrypted(value: string | undefined): Promise<void> {
    await this.updateDb(async (db) => {
      db.webApiKeyEncrypted = value
    })
  }

  /**
   * Returns the manual SteamCMD executable path override, if configured.
   */
  async getSteamCmdManualPath(): Promise<string | undefined> {
    const db = await this.readDb()
    return db.steamCmdManualPath
  }

  /**
   * Stores the manual SteamCMD executable path override. Passing `undefined`
   * clears the override and lets automatic SteamCMD discovery run again.
   */
  async setSteamCmdManualPath(path: string | undefined): Promise<void> {
    await this.updateDb(async (db) => {
      db.steamCmdManualPath = path
    })
  }

  /**
   * Returns normalized SteamCMD timeout settings.
   *
   * If the database contains the legacy login-timeout-only default, this method
   * also rewrites the database with the current full timeout set.
   */
  async getTimeoutSettings(): Promise<SteamCmdTimeoutSettings> {
    const db = await this.readDb()
    const shouldMigrateLegacyLoginDefault =
      db.loginTimeoutMs === LEGACY_LOGIN_TIMEOUT_DEFAULT_MS &&
      typeof db.storedSessionTimeoutMs !== 'number' &&
      typeof db.workshopTimeoutMs !== 'number'

    const normalizedInput = {
      loginTimeoutMs: shouldMigrateLegacyLoginDefault ? undefined : db.loginTimeoutMs,
      storedSessionTimeoutMs: db.storedSessionTimeoutMs,
      workshopTimeoutMs: db.workshopTimeoutMs
    }

    if (shouldMigrateLegacyLoginDefault) {
      const migrated = normalizeSteamCmdTimeoutSettings(normalizedInput)
      await this.updateDb(async (mutableDb) => {
        mutableDb.loginTimeoutMs = migrated.loginTimeoutMs
        mutableDb.storedSessionTimeoutMs = migrated.storedSessionTimeoutMs
        mutableDb.workshopTimeoutMs = migrated.workshopTimeoutMs
      })
      return migrated
    }

    return normalizeSteamCmdTimeoutSettings({
      loginTimeoutMs: normalizedInput.loginTimeoutMs,
      storedSessionTimeoutMs: normalizedInput.storedSessionTimeoutMs,
      workshopTimeoutMs: normalizedInput.workshopTimeoutMs
    })
  }

  /**
   * Normalizes and persists all SteamCMD timeout settings.
   */
  async setTimeoutSettings(input: SteamCmdTimeoutSettings): Promise<void> {
    const normalized = normalizeSteamCmdTimeoutSettings(input)
    await this.updateDb(async (db) => {
      db.loginTimeoutMs = normalized.loginTimeoutMs
      db.storedSessionTimeoutMs = normalized.storedSessionTimeoutMs
      db.workshopTimeoutMs = normalized.workshopTimeoutMs
    })
  }

  /**
   * Saves the advanced settings panel as one atomic store update.
   *
   * Keeping these fields together prevents the renderer from observing mixed
   * values when the user changes Web API, manual SteamCMD path, and timeout
   * settings in one form submission.
   */
  async setAdvancedSettingsState(input: {
    webApiEnabled: boolean
    webApiKeyEncrypted: string | undefined
    steamCmdManualPath: string | undefined
    timeoutSettings: SteamCmdTimeoutSettings
  }): Promise<void> {
    const normalizedTimeouts = normalizeSteamCmdTimeoutSettings(input.timeoutSettings)
    await this.updateDb(async (db) => {
      db.webApiEnabled = input.webApiEnabled
      db.webApiKeyEncrypted = input.webApiKeyEncrypted
      db.steamCmdManualPath = input.steamCmdManualPath
      db.loginTimeoutMs = normalizedTimeouts.loginTimeoutMs
      db.storedSessionTimeoutMs = normalizedTimeouts.storedSessionTimeoutMs
      db.workshopTimeoutMs = normalizedTimeouts.workshopTimeoutMs
    })
  }
}
