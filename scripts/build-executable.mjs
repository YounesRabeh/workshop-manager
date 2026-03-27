/**
 * Overview: Orchestrates the local executable packaging workflow.
 * Responsibility: Resolves platform-specific electron-builder arguments,
 *  assembles the ordered build steps, and runs them when invoked as a CLI.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Uses the Windows shim when packaging on win32 and the plain binary elsewhere.
 */
export function resolvePnpmCommand(platform = process.platform) {
  return platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

/**
 * Maps the current host platform to the electron-builder target this repo ships.
 */
export function getPackagingTargetForPlatform(platform) {
  if (platform === 'win32') {
    return { platformArg: '--win', target: 'nsis' }
  }
  if (platform === 'darwin') {
    return { platformArg: '--mac', target: 'dmg' }
  }
  if (platform === 'linux') {
    return { platformArg: '--linux', target: 'AppImage' }
  }
  throw new Error(`Unsupported platform for executable packaging: ${platform}`)
}

export function getElectronBuilderArgsForPlatform(platform) {
  const mapping = getPackagingTargetForPlatform(platform)
  return ['exec', 'electron-builder', mapping.platformArg, mapping.target, '--publish', 'never']
}

/**
 * Only `--generate-icon` is supported today; everything else is ignored on purpose.
 */
export function parseBuildExecutableOptions(argv = []) {
  const normalized = Array.isArray(argv) ? argv : []
  return {
    generateIcon: normalized.includes('--generate-icon')
  }
}

/**
 * Builds the exact sequence used by `pnpm build:exe`, including optional icon sync.
 */
export function buildStepsForPlatform(platform, options = {}) {
  const pnpmCommand = resolvePnpmCommand(platform)
  const steps = [
    {
      label: 'Kill old app instance',
      command: pnpmCommand,
      args: ['kill:instance']
    },
    {
      label: 'Build app bundles',
      command: pnpmCommand,
      args: ['build:bundle']
    },
    {
      label: 'Package executable artifacts',
      command: pnpmCommand,
      args: getElectronBuilderArgsForPlatform(platform)
    }
  ]

  if (options.generateIcon) {
    steps.splice(1, 0, {
      label: 'Sync icon assets',
      command: pnpmCommand,
      args: ['sync:icon']
    })
  }

  return steps
}

function runStep(step) {
  console.log(`\n[build:exe] ${step.label}`)
  const result = spawnSync(step.command, step.args, { stdio: 'inherit', shell: false })
  if (result.status !== 0) {
    throw new Error(`[build:exe] Step failed: ${step.label}`)
  }
}

async function main() {
  const options = parseBuildExecutableOptions(process.argv.slice(2))
  const steps = buildStepsForPlatform(process.platform, options)
  for (const step of steps) {
    runStep(step)
  }
}

function isCliEntrypoint() {
  const entry = process.argv[1]
  if (!entry) {
    return false
  }
  return pathToFileURL(resolve(entry)).href === import.meta.url
}

if (isCliEntrypoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
