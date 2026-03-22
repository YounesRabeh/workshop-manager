/**
 * Overview: Persists profile and preference state in a local JSON-backed store.
 * Responsibility: Reads/writes mod profiles, remembered auth options, and Web API settings, with directory bootstrap and reset support.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ModProfile } from '@shared/contracts'

interface ProfileDb {
  rememberedUsername?: string
  rememberAuth?: boolean
  webApiEnabled?: boolean
  webApiKeyEncrypted?: string
  profiles: ModProfile[]
}

const DEFAULT_DB: ProfileDb = {
  profiles: []
}

export class ProfileStore {
  constructor(private readonly dbPath: string) {}

  private async readDb(): Promise<ProfileDb> {
    try {
      const data = await readFile(this.dbPath, 'utf8')
      const parsed = JSON.parse(data) as ProfileDb
      return {
        profiles: parsed.profiles ?? [],
        rememberedUsername: parsed.rememberedUsername,
        rememberAuth: parsed.rememberAuth,
        webApiEnabled: parsed.webApiEnabled,
        webApiKeyEncrypted: parsed.webApiKeyEncrypted
      }
    } catch {
      return { ...DEFAULT_DB }
    }
  }

  private async writeDb(db: ProfileDb): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true })
    await writeFile(this.dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8')
  }

  async getProfiles(): Promise<ModProfile[]> {
    const db = await this.readDb()
    return db.profiles
  }

  async saveProfile(profile: ModProfile): Promise<ModProfile> {
    const db = await this.readDb()
    const existingIndex = db.profiles.findIndex((item) => item.id === profile.id)

    if (existingIndex >= 0) {
      db.profiles[existingIndex] = profile
    } else {
      db.profiles.push(profile)
    }

    await this.writeDb(db)
    return profile
  }

  async deleteProfile(profileId: string): Promise<void> {
    const db = await this.readDb()
    db.profiles = db.profiles.filter((item) => item.id !== profileId)
    await this.writeDb(db)
  }

  async getRememberedUsername(): Promise<string | undefined> {
    const db = await this.readDb()
    return db.rememberedUsername
  }

  async setRememberedUsername(username: string | undefined): Promise<void> {
    const db = await this.readDb()
    db.rememberedUsername = username
    await this.writeDb(db)
  }

  async getRememberAuth(): Promise<boolean> {
    const db = await this.readDb()
    return db.rememberAuth === true
  }

  async setRememberAuth(enabled: boolean): Promise<void> {
    const db = await this.readDb()
    db.rememberAuth = enabled
    await this.writeDb(db)
  }

  async getWebApiEnabled(): Promise<boolean> {
    const db = await this.readDb()
    return db.webApiEnabled === true
  }

  async setWebApiEnabled(enabled: boolean): Promise<void> {
    const db = await this.readDb()
    db.webApiEnabled = enabled
    await this.writeDb(db)
  }

  async getWebApiKeyEncrypted(): Promise<string | undefined> {
    const db = await this.readDb()
    return db.webApiKeyEncrypted
  }

  async setWebApiKeyEncrypted(value: string | undefined): Promise<void> {
    const db = await this.readDb()
    db.webApiKeyEncrypted = value
    await this.writeDb(db)
  }

  async clear(): Promise<void> {
    await rm(join(dirname(this.dbPath)), { recursive: true, force: true })
  }
}
