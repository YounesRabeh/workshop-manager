/**
 * Overview: Provides canonical filesystem paths for backend persistence and runtime data.
 * Responsibility: Derives user-data rooted locations for profiles, run logs, and SteamCMD runtime artifacts.
 */
import { app } from 'electron'
import { join } from 'node:path'

export interface AppPaths {
  dataDir: string
  profilesPath: string
  runLogsDir: string
  runtimeDir: string
}

export function getAppPaths(): AppPaths {
  const dataDir = app.getPath('userData')
  return {
    dataDir,
    profilesPath: join(dataDir, 'profiles.json'),
    runLogsDir: join(dataDir, 'runs'),
    runtimeDir: join(dataDir, 'runtime')
  }
}
