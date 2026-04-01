/**
 * Overview: Orchestrates the local executable packaging workflow.
 * Responsibility: Resolves platform-specific electron-builder arguments,
 *  assembles the ordered build steps, and runs them when invoked as a CLI.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
export const NATIVE_BUNDLE_SCRIPT = 'build:bundle:native'
export const SKIP_KILL_INSTANCE_FLAG = '--skip-kill-instance'

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
  return [mapping.platformArg, mapping.target, '--publish', 'never']
}

function resolveElectronBuilderCliEntry() {
  return require.resolve('electron-builder/cli.js')
}

export function normalizeBuildTargetPlatform(platform) {
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
    return platform
  }
  throw new Error(`Unsupported target platform for executable packaging: ${platform}`)
}

/**
 * Parses the supported packaging flags while intentionally ignoring unrelated extras.
 */
export function parseBuildExecutableOptions(argv = []) {
  const normalized = Array.isArray(argv) ? argv : []
  const requestedTargets = new Set()

  for (const arg of normalized) {
    if (arg === '--win') {
      requestedTargets.add('win32')
      continue
    }
    if (arg === '--mac') {
      requestedTargets.add('darwin')
      continue
    }
    if (arg === '--linux') {
      requestedTargets.add('linux')
      continue
    }
    if (arg.startsWith('--platform=')) {
      requestedTargets.add(normalizeBuildTargetPlatform(arg.slice('--platform='.length)))
    }
  }

  if (requestedTargets.size > 1) {
    throw new Error(
      `Conflicting target platforms requested: ${[...requestedTargets].join(', ')}`
    )
  }

  return {
    generateIcon: normalized.includes('--generate-icon'),
    skipKillInstance: normalized.includes(SKIP_KILL_INSTANCE_FLAG),
    targetPlatform: requestedTargets.size === 1 ? [...requestedTargets][0] : undefined
  }
}

/**
 * Builds the exact sequence used by the executable packaging scripts, including optional icon sync.
 */
export function buildStepsForPlatform(platform, options = {}) {
  const pnpmCommand = resolvePnpmCommand(platform)
  const targetPlatform = options.targetPlatform
    ? normalizeBuildTargetPlatform(options.targetPlatform)
    : platform
  const steps = []

  if (options.skipKillInstance !== true) {
    steps.push({
      label: 'Kill old app instance',
      command: pnpmCommand,
      args: ['kill:instance']
    })
  }

  steps.push(
    {
      label: 'Build app bundles',
      command: pnpmCommand,
      args: [NATIVE_BUNDLE_SCRIPT]
    },
    {
      label: 'Package executable artifacts',
      command: process.execPath,
      args: [resolveElectronBuilderCliEntry(), ...getElectronBuilderArgsForPlatform(targetPlatform)]
    }
  )

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
  console.log(`\n[build:package] ${step.label}`)
  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: false,
    env: step.env ?? process.env
  })
  if (result.status !== 0) {
    throw new Error(`[build:package] Step failed: ${step.label}`)
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
