/**
 * Overview: Runs electron-vite dev and preview commands in a cross-platform way.
 * Responsibility: Normalizes the child environment for Electron, applies the
 *  Linux desktop entry hint when needed, and delegates to the local pnpm CLI.
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolvePnpmCommand } from '../build/build-executable.mjs'

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

export function runElectronViteCommand(options = {}, deps = {}) {
  const commandName = normalizeElectronViteCommand(options.commandName)
  const platform = options.platform ?? process.platform
  const forwardedArgs = Array.isArray(options.forwardedArgs) ? options.forwardedArgs : []
  const spawnImpl = deps.spawnImpl ?? spawn
  const env =
    deps.env ??
    createElectronViteEnv(platform, deps.baseEnv ?? process.env)

  return new Promise((resolveResult) => {
    const child = spawnImpl(resolvePnpmCommand(platform), createElectronViteArgs(commandName, forwardedArgs), {
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
