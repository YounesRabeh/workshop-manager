/**
 * Overview: Public build/release entry point used by package.json scripts.
 * Responsibility: Normalizes target names, keeps icon/checksum behavior in one
 *  place, and delegates reproducible packaging work to the Docker build helper.
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolvePnpmCommand } from './build-executable.mjs'

export const DEFAULT_BUILD_TARGET = 'bundle'
export const RELEASE_BUILD_TARGETS = ['linux', 'win']
export const SUPPORTED_BUILD_TARGETS = ['bundle', 'linux', 'win', 'windows', 'all']

export function normalizeBuildTarget(target = DEFAULT_BUILD_TARGET) {
  const normalized = String(target || DEFAULT_BUILD_TARGET).toLowerCase()

  if (normalized === 'windows') {
    return 'win'
  }
  if (SUPPORTED_BUILD_TARGETS.includes(normalized)) {
    return normalized
  }

  throw new Error(
    `Unsupported build target "${target}". Expected one of: bundle, linux, win, windows, all`
  )
}

export function parseBuildPlatformOptions(argv = []) {
  const normalized = Array.isArray(argv) ? argv : []
  const targetArg = normalized.find((arg) => !arg.startsWith('-')) ?? DEFAULT_BUILD_TARGET

  return {
    target: normalizeBuildTarget(targetArg),
    checksums: normalized.includes('--checksums'),
    icons: !normalized.includes('--skip-icons')
  }
}

export function createDockerBuildStep(target, { icons = true } = {}) {
  const normalizedTarget = normalizeBuildTarget(target)

  if (normalizedTarget === 'bundle') {
    return {
      label: 'Build production bundle',
      command: process.execPath,
      args: ['scripts/build/run-build-in-docker.mjs', 'build:bundle:native']
    }
  }

  const platformArgs = {
    linux: ['--linux'],
    win: ['--win']
  }[normalizedTarget]

  if (!platformArgs) {
    throw new Error(`Build target "${target}" cannot be run as a single Docker packaging step.`)
  }

  return {
    label: `Build ${normalizedTarget} package`,
    command: process.execPath,
    args: [
      'scripts/build/run-build-in-docker.mjs',
      'build:exe:native',
      ...platformArgs,
      ...(icons ? ['--generate-icon'] : [])
    ]
  }
}

export function createBuildPlatformSteps(options = {}, platform = process.platform) {
  const target = normalizeBuildTarget(options.target)
  const pnpmCommand = resolvePnpmCommand(platform)
  const steps = []

  if (target === 'bundle') {
    if (options.icons !== false) {
      steps.push({
        label: 'Generate icon assets',
        command: pnpmCommand,
        args: ['icon']
      })
    }
    steps.push(createDockerBuildStep('bundle', options))
  } else {
    const buildTargets = target === 'all' ? RELEASE_BUILD_TARGETS : [target]
    for (const buildTarget of buildTargets) {
      steps.push(createDockerBuildStep(buildTarget, options))
    }
  }

  if (options.checksums) {
    steps.push({
      label: 'Generate release checksums',
      command: pnpmCommand,
      args: ['checksums']
    })
  }

  return steps
}

function runStep(step) {
  console.log(`\n[build] ${step.label}`)

  return new Promise((resolveStep, rejectStep) => {
    const child = spawn(step.command, step.args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false,
      env: process.env
    })

    child.once('error', rejectStep)
    child.once('close', (status) => {
      if (status === 0) {
        resolveStep()
        return
      }
      rejectStep(new Error(`[build] Step failed: ${step.label}`))
    })
  })
}

async function main(argv = process.argv.slice(2)) {
  const options = parseBuildPlatformOptions(argv)
  const steps = createBuildPlatformSteps(options)
  for (const step of steps) {
    await runStep(step)
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
