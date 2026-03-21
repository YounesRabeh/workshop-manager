/**
 * Overview: path-provider.ts module in backend/services.
 * Responsibility: Holds the primary logic/exports for this area of the app.
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
