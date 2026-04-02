/**
 * Overview: Manages stable Electron user-data path setup and migration from legacy app directories.
 * Responsibility: Configures the canonical user-data location and copies forward missing files from older layouts.
 */
import { app } from 'electron'
import { dirname, join } from 'node:path'
import { access, copyFile, mkdir, readdir } from 'node:fs/promises'

const STABLE_USER_DATA_DIR_NAME = 'workshop-manager'

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function copyMissingTree(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true })
  const entries = await readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await copyMissingTree(sourcePath, targetPath)
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    if (await pathExists(targetPath)) {
      continue
    }
    await mkdir(dirname(targetPath), { recursive: true })
    await copyFile(sourcePath, targetPath)
  }
}

export function configureStableUserDataPath(): string {
  const stablePath = join(app.getPath('appData'), STABLE_USER_DATA_DIR_NAME)
  app.setPath('userData', stablePath)
  return stablePath
}

export async function migrateLegacyUserData(stableUserDataPath: string): Promise<void> {
  const appDataPath = app.getPath('appData')
  const legacyCandidates = [
    join(appDataPath, 'Workshop Manager', 'workshop-manager'),
    join(appDataPath, 'steam-workshop-mod-manager', 'workshop-manager'),
    join(appDataPath, 'Workshop Manager'),
    join(appDataPath, 'steam-workshop-mod-manager')
  ].filter((candidate) => candidate !== stableUserDataPath)

  for (const legacyPath of legacyCandidates) {
    if (!(await pathExists(legacyPath))) {
      continue
    }
    await copyMissingTree(legacyPath, stableUserDataPath)
  }
}
