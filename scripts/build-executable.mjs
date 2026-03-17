import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function resolvePnpmCommand(platform = process.platform) {
  return platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

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

export function buildStepsForPlatform(platform) {
  const pnpmCommand = resolvePnpmCommand(platform)
  return [
    {
      label: 'Kill old app instance',
      command: pnpmCommand,
      args: ['kill:instance']
    },
    {
      label: 'Sync icon assets',
      command: pnpmCommand,
      args: ['sync:icon']
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
}

function runStep(step) {
  console.log(`\n[build:exe] ${step.label}`)
  const result = spawnSync(step.command, step.args, { stdio: 'inherit', shell: false })
  if (result.status !== 0) {
    throw new Error(`[build:exe] Step failed: ${step.label}`)
  }
}

async function main() {
  const steps = buildStepsForPlatform(process.platform)
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
