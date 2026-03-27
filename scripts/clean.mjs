/**
 * Overview: Removes local build artifacts created by development and packaging commands.
 * Responsibility: Deletes generated output folders and root tsbuildinfo files,
 *  with an optional `--dry-run` mode for previewing the cleanup.
 */
import { access, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const rootDir = process.cwd()
const dryRun = process.argv.includes('--dry-run')

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const rootEntries = await readdir(rootDir, { withFileTypes: true })
// Keep the cleanup scope intentionally narrow so app data and resources are untouched.
const buildInfoTargets = rootEntries
  .filter((entry) => entry.isFile() && /^tsconfig(?:\..+)?\.tsbuildinfo$/.test(entry.name))
  .map((entry) => entry.name)

const targets = ['dist', 'out', ...buildInfoTargets]

let cleanedAny = false

for (const relativePath of targets) {
  const targetPath = join(rootDir, relativePath)
  if (!(await pathExists(targetPath))) {
    continue
  }

  cleanedAny = true
  if (dryRun) {
    console.log(`[dry-run] Would remove ${relativePath}`)
    continue
  }

  await rm(targetPath, { recursive: true, force: true })
  console.log(`Removed ${relativePath}`)
}

if (!cleanedAny) {
  console.log('Nothing to clean.')
}
