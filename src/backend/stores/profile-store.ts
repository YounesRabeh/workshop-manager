/**
 * Overview: Persists profile and preference state in a local JSON-backed store.
 * Responsibility: Reads/writes mod profiles, remembered auth options, and Web API settings, with directory bootstrap and reset support.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'
import type { ModProfile } from '@shared/contracts'
import type { SteamCmdTimeoutSettings } from '@shared/runtime-settings'
import { normalizeSteamCmdTimeoutSettings } from '@shared/runtime-settings'

interface ProfileDb {
  rememberedUsername?: string
  rememberAuth?: boolean
  webApiEnabled?: boolean
  webApiKeyEncrypted?: string
  steamCmdManualPath?: string
  loginTimeoutMs?: number
  storedSessionTimeoutMs?: number
  workshopTimeoutMs?: number
  profiles: ModProfile[]
}

const DEFAULT_DB: ProfileDb = {
  profiles: []
}

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
    webApiEnabled: record.webApiEnabled,
    webApiKeyEncrypted: record.webApiKeyEncrypted,
    steamCmdManualPath: record.steamCmdManualPath,
    loginTimeoutMs: record.loginTimeoutMs,
    storedSessionTimeoutMs: record.storedSessionTimeoutMs,
    workshopTimeoutMs: record.workshopTimeoutMs
  }
}

export class ProfileStore {
  private writeChain: Promise<void> = Promise.resolve()

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

  async getProfiles(): Promise<ModProfile[]> {
    const db = await this.readDb()
    return db.profiles
  }

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

  async deleteProfile(profileId: string): Promise<void> {
    await this.updateDb(async (db) => {
      db.profiles = db.profiles.filter((item) => item.id !== profileId)
    })
  }

  async getRememberedUsername(): Promise<string | undefined> {
    const db = await this.readDb()
    return db.rememberedUsername
  }

  async setRememberedUsername(username: string | undefined): Promise<void> {
    await this.updateDb(async (db) => {
      db.rememberedUsername = username
    })
  }

  async getRememberAuth(): Promise<boolean> {
    const db = await this.readDb()
    return db.rememberAuth === true
  }

  async setRememberAuth(enabled: boolean): Promise<void> {
    await this.updateDb(async (db) => {
      db.rememberAuth = enabled
    })
  }

  async setRememberedLoginState(input: {
    rememberedUsername: string | undefined
    rememberAuth: boolean
  }): Promise<void> {
    await this.updateDb(async (db) => {
      db.rememberedUsername = input.rememberedUsername
      db.rememberAuth = input.rememberAuth
    })
  }

  async getWebApiEnabled(): Promise<boolean> {
    const db = await this.readDb()
    return db.webApiEnabled === true
  }

  async setWebApiEnabled(enabled: boolean): Promise<void> {
    await this.updateDb(async (db) => {
      db.webApiEnabled = enabled
    })
  }

  async getWebApiKeyEncrypted(): Promise<string | undefined> {
    const db = await this.readDb()
    return db.webApiKeyEncrypted
  }

  async setWebApiKeyEncrypted(value: string | undefined): Promise<void> {
    await this.updateDb(async (db) => {
      db.webApiKeyEncrypted = value
    })
  }

  async getSteamCmdManualPath(): Promise<string | undefined> {
    const db = await this.readDb()
    return db.steamCmdManualPath
  }

  async setSteamCmdManualPath(path: string | undefined): Promise<void> {
    await this.updateDb(async (db) => {
      db.steamCmdManualPath = path
    })
  }

  async getTimeoutSettings(): Promise<SteamCmdTimeoutSettings> {
    const db = await this.readDb()
    return normalizeSteamCmdTimeoutSettings({
      loginTimeoutMs: db.loginTimeoutMs,
      storedSessionTimeoutMs: db.storedSessionTimeoutMs,
      workshopTimeoutMs: db.workshopTimeoutMs
    })
  }

  async setTimeoutSettings(input: SteamCmdTimeoutSettings): Promise<void> {
    const normalized = normalizeSteamCmdTimeoutSettings(input)
    await this.updateDb(async (db) => {
      db.loginTimeoutMs = normalized.loginTimeoutMs
      db.storedSessionTimeoutMs = normalized.storedSessionTimeoutMs
      db.workshopTimeoutMs = normalized.workshopTimeoutMs
    })
  }

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
