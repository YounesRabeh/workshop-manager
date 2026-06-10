/**
 * Overview: Runs electron-vite dev and preview commands in a cross-platform way.
 * Responsibility: Normalizes the child environment for Electron, applies the
 *  Linux desktop entry hint when needed, and delegates to the local pnpm CLI.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPnpmInvocation } from '../build/build-executable.mjs'

const require = createRequire(import.meta.url)
export const SUPPORTED_ELECTRON_VITE_COMMANDS = ['dev', 'preview']

export function normalizeElectronViteCommand(commandName) {
  if (SUPPORTED_ELECTRON_VITE_COMMANDS.includes(commandName)) {
    return commandName
  }

  throw new Error(
    `Unsupported electron-vite command "${commandName}". Expected one of: ${SUPPORTED_ELECTRON_VITE_COMMANDS.join(', ')}`
  )
}

export function createElectronViteArgs(commandName, forwardedArgs = []) {
  return ['exec', 'electron-vite', normalizeElectronViteCommand(commandName), ...forwardedArgs]
}

export function createElectronViteEnv(platform = process.platform, env = process.env) {
  const normalizedEnv = { ...env }

  delete normalizedEnv.ELECTRON_RUN_AS_NODE

  if (platform === 'linux') {
    normalizedEnv.CHROME_DESKTOP ??= 'workshop-manager.desktop'
  } else {
    delete normalizedEnv.CHROME_DESKTOP
  }

  return normalizedEnv
}

export function resolveElectronBinaryPath(requireImpl = require) {
  const electronPath = requireImpl('electron')
  if (typeof electronPath !== 'string' || electronPath.length === 0) {
    throw new Error('Electron package did not resolve to a binary path.')
  }

  return electronPath
}

export function createElectronRebuildArgs() {
  return ['rebuild', 'electron']
}

export function resolveElectronInstallScriptPath(requireImpl = require) {
  if (typeof requireImpl.resolve !== 'function') {
    throw new Error('Electron installer path requires a require implementation with resolve().')
  }

  return requireImpl.resolve('electron/install.js')
}

export function createElectronRebuildEnv(env = process.env) {
  const normalizedEnv = { ...env }

  delete normalizedEnv.ELECTRON_RUN_AS_NODE
  delete normalizedEnv.ELECTRON_SKIP_BINARY_DOWNLOAD

  normalizedEnv.force_no_cache = 'true'

  return normalizedEnv
}

function runChildCommand(command, args, options = {}, deps = {}) {
  const spawnImpl = deps.spawnImpl ?? spawn

  return new Promise((resolveResult) => {
    const child = spawnImpl(command, args, {
      stdio: options.stdio ?? 'inherit',
      shell: false,
      env: options.env ?? process.env
    })

    child.once('error', (error) => {
      resolveResult({
        status: null,
        error
      })
    })

    child.once('close', (status, signal) => {
      resolveResult({
        status,
        signal
      })
    })
  })
}

function runPnpmCommand(args, options = {}, deps = {}) {
  const platform = options.platform ?? process.platform
  const pnpmInvocation = createPnpmInvocation(args, platform, options.baseEnv ?? process.env)

  return runChildCommand(pnpmInvocation.command, pnpmInvocation.args, options, deps)
}

function runElectronInstallScript(options = {}, deps = {}) {
  const requireImpl = deps.requireImpl ?? require
  return runChildCommand(
    process.execPath,
    [resolveElectronInstallScriptPath(requireImpl)],
    options,
    deps
  )
}

export async function ensureElectronBinaryInstalled(options = {}, deps = {}) {
  const requireImpl = deps.requireImpl ?? require
  const rebuildEnv = createElectronRebuildEnv(options.env ?? process.env)

  try {
    resolveElectronBinaryPath(requireImpl)
    return
  } catch (initialError) {
    console.warn('Electron binary is missing or incomplete. Running `pnpm rebuild electron`...')

    const rebuildResult = await runPnpmCommand(
      createElectronRebuildArgs(),
      {
        platform: options.platform,
        baseEnv: deps.baseEnv ?? process.env,
        env: rebuildEnv
      },
      deps
    )

    if (rebuildResult?.error) {
      throw rebuildResult.error
    }

    if (rebuildResult?.status !== 0) {
      throw new Error(`Electron rebuild failed with exit code ${rebuildResult?.status ?? 1}.`)
    }

    try {
      resolveElectronBinaryPath(requireImpl)
      return
    } catch {
      console.warn('Electron is still missing after rebuild. Running Electron installer directly...')
    }

    const installResult = await runElectronInstallScript(
      {
        env: rebuildEnv
      },
      deps
    )

    if (installResult?.error) {
      throw installResult.error
    }

    if (installResult?.status !== 0) {
      throw new Error(`Electron direct install failed with exit code ${installResult?.status ?? 1}.`)
    }

    try {
      resolveElectronBinaryPath(requireImpl)
    } catch {
      throw new Error(
        `Electron is still missing after rebuild and direct install. Original error: ${
          initialError instanceof Error ? initialError.message : String(initialError)
        }. Try deleting node_modules and reinstalling if Electron could not be downloaded.`
      )
    }
  }
}

export function runElectronViteCommand(options = {}, deps = {}) {
  const commandName = normalizeElectronViteCommand(options.commandName)
  const platform = options.platform ?? process.platform
  const forwardedArgs = Array.isArray(options.forwardedArgs) ? options.forwardedArgs : []
  const spawnImpl = deps.spawnImpl ?? spawn
  const env =
    deps.env ??
    createElectronViteEnv(platform, deps.baseEnv ?? process.env)

  return new Promise((resolveResult) => {
    const pnpmInvocation = createPnpmInvocation(
      createElectronViteArgs(commandName, forwardedArgs),
      platform,
      deps.baseEnv ?? process.env
    )
    const child = spawnImpl(pnpmInvocation.command, pnpmInvocation.args, {
      stdio: 'inherit',
      shell: false,
      env
    })

    child.once('error', (error) => {
      resolveResult({
        status: null,
        error
      })
    })

    child.once('close', (status, signal) => {
      resolveResult({
        status,
        signal
      })
    })
  })
}

function ensureCommandSucceeded(result) {
  if (!result?.error && result?.status === 0) {
    return
  }

  if (result?.error) {
    throw result.error
  }

  throw new Error(`electron-vite command failed with exit code ${result?.status ?? 1}.`)
}

function isCliEntrypoint() {
  const entry = process.argv[1]
  if (!entry) {
    return false
  }
  return pathToFileURL(resolve(entry)).href === import.meta.url
}

async function main(argv = process.argv.slice(2)) {
  const [commandName, ...forwardedArgs] = argv
  if (!commandName) {
    throw new Error(
      `Missing electron-vite command argument. Expected one of: ${SUPPORTED_ELECTRON_VITE_COMMANDS.join(', ')}`
    )
  }

  await ensureElectronBinaryInstalled()

  const result = await runElectronViteCommand({
    commandName,
    forwardedArgs
  })
  ensureCommandSucceeded(result)
}

if (isCliEntrypoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
