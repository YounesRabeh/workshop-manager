/**
 * Overview: Runs reproducible Electron build/package workflows inside Docker.
 * Responsibility: Verifies host prerequisites, performs host-only preflight
 *  steps, then executes the requested internal pnpm build script in Docker.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolvePnpmCommand, SKIP_KILL_INSTANCE_FLAG } from './build-executable.mjs'

export const SUPPORTED_INTERNAL_BUILD_SCRIPTS = ['build:bundle:native', 'build:exe:native']
export const DEFAULT_DOCKERFILE_PATH = 'docker/builder.Dockerfile'
export const DEFAULT_DOCKER_CONTEXT_PATH = 'docker'
export const DEFAULT_HOST_CACHE_ROOT = resolve(
  homedir(),
  '.cache',
  'workshop-manager',
  'docker-build'
)
export const CONTAINER_PROJECT_DIR = '/project'
export const CONTAINER_NODE_MODULES_DIR = '/project/node_modules'
export const CONTAINER_HOME_DIR = '/home/builder'
export const CONTAINER_PNPM_STORE_DIR = '/pnpm/store'
export const CONTAINER_COREPACK_HOME = '/pnpm/corepack'
export const CONTAINER_ELECTRON_CACHE_DIR = '/home/builder/.cache/electron'
export const CONTAINER_ELECTRON_BUILDER_CACHE_DIR = '/home/builder/.cache/electron-builder'
export const SUPPORTED_DOCKER_BUILD_HOSTS = ['linux', 'win32']

export function assertSupportedDockerBuildHost(platform = process.platform) {
  if (!SUPPORTED_DOCKER_BUILD_HOSTS.includes(platform)) {
    throw new Error(
      `Dockerized builds are currently supported on Linux and Windows hosts only. Current host: ${platform}`
    )
  }
}

export function normalizeInternalBuildScript(scriptName) {
  if (SUPPORTED_INTERNAL_BUILD_SCRIPTS.includes(scriptName)) {
    return scriptName
  }

  throw new Error(
    `Unsupported internal build script "${scriptName}". Expected one of: ${SUPPORTED_INTERNAL_BUILD_SCRIPTS.join(', ')}`
  )
}

export function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

export function sanitizeDockerIdentifier(value) {
  const normalized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized.length > 0 ? normalized : 'workspace'
}

export function createProjectFingerprint(projectDir) {
  return createHash('sha256').update(resolve(projectDir)).digest('hex').slice(0, 12)
}

export function createDockerBuildIdentity(projectDir) {
  const resolvedProjectDir = resolve(projectDir)
  const projectSlug = sanitizeDockerIdentifier(basename(resolvedProjectDir))
  const fingerprint = createProjectFingerprint(resolvedProjectDir)
  const baseName = `${projectSlug}-${fingerprint}`

  return {
    projectSlug,
    fingerprint,
    baseName,
    imageTag: `${baseName}:local`
  }
}

export function createDockerMountPaths(projectDir, hostCacheRoot = DEFAULT_HOST_CACHE_ROOT) {
  const identity = createDockerBuildIdentity(projectDir)
  const cacheRoot = resolve(hostCacheRoot, identity.baseName)
  const homeDir = resolve(cacheRoot, 'home')

  return {
    cacheRoot,
    homeDir,
    homeCacheDir: resolve(homeDir, '.cache'),
    nodeModulesDir: resolve(cacheRoot, 'node_modules'),
    pnpmStoreDir: resolve(cacheRoot, 'pnpm-store'),
    corepackDir: resolve(cacheRoot, 'corepack'),
    electronCacheDir: resolve(cacheRoot, 'electron-cache'),
    electronBuilderCacheDir: resolve(cacheRoot, 'electron-builder-cache')
  }
}

export function ensureDockerMountPathsExist(mountPaths, mkdirSyncImpl = mkdirSync) {
  for (const targetPath of Object.values(mountPaths)) {
    mkdirSyncImpl(targetPath, { recursive: true })
  }
}

export function createDockerBuildArgs({
  projectDir,
  imageTag,
  dockerfilePath = DEFAULT_DOCKERFILE_PATH,
  contextPath = DEFAULT_DOCKER_CONTEXT_PATH
}) {
  return [
    'build',
    '--file',
    resolve(projectDir, dockerfilePath),
    '--tag',
    imageTag,
    resolve(projectDir, contextPath)
  ]
}

export function createContainerForwardedArgs(scriptName, forwardedArgs = []) {
  const normalizedScript = normalizeInternalBuildScript(scriptName)
  const normalizedArgs = Array.isArray(forwardedArgs) ? [...forwardedArgs] : []

  if (
    normalizedScript === 'build:exe:native' &&
    !normalizedArgs.includes(SKIP_KILL_INSTANCE_FLAG)
  ) {
    normalizedArgs.push(SKIP_KILL_INSTANCE_FLAG)
  }

  return normalizedArgs
}

export function createHostPreflightSteps(scriptName, platform = process.platform) {
  const normalizedScript = normalizeInternalBuildScript(scriptName)
  const pnpmCommand = resolvePnpmCommand(platform)

  if (normalizedScript === 'build:bundle:native' || normalizedScript === 'build:exe:native') {
    return [
      {
        label: 'Kill old host app instance',
        command: pnpmCommand,
        args: ['kill:instance']
      }
    ]
  }

  return []
}

export function createContainerShellCommand(scriptName, forwardedArgs = []) {
  const normalizedScript = normalizeInternalBuildScript(scriptName)
  const normalizedArgs = createContainerForwardedArgs(normalizedScript, forwardedArgs)
  const installCommand = 'pnpm install --frozen-lockfile'
  const runCommand =
    normalizedArgs.length > 0
      ? `pnpm run ${shellEscape(normalizedScript)} -- ${normalizedArgs.map(shellEscape).join(' ')}`
      : `pnpm run ${shellEscape(normalizedScript)}`

  return `${installCommand} && ${runCommand}`
}

export function createDockerRunArgs({
  projectDir,
  imageTag,
  uid,
  gid,
  hostPlatform = process.platform,
  mountPaths,
  scriptName,
  forwardedArgs = []
}) {
  const resolvedProjectDir = resolve(projectDir)
  const args = [
    'run',
    '--rm',
    '--workdir',
    CONTAINER_PROJECT_DIR
  ]

  if (typeof uid === 'number' && typeof gid === 'number') {
    args.push('--user', `${uid}:${gid}`)
  }

  if (hostPlatform === 'linux') {
    args.push('--security-opt', 'label=disable')
  }

  args.push(
    '--env',
    `HOME=${CONTAINER_HOME_DIR}`,
    '--env',
    'PNPM_HOME=/pnpm',
    '--env',
    `PNPM_STORE_DIR=${CONTAINER_PNPM_STORE_DIR}`,
    '--env',
    `COREPACK_HOME=${CONTAINER_COREPACK_HOME}`,
    '--env',
    `XDG_CACHE_HOME=${resolve(CONTAINER_HOME_DIR, '.cache')}`,
    '--env',
    `ELECTRON_CACHE=${CONTAINER_ELECTRON_CACHE_DIR}`,
    '--env',
    `ELECTRON_BUILDER_CACHE=${CONTAINER_ELECTRON_BUILDER_CACHE_DIR}`,
    '--volume',
    `${resolvedProjectDir}:${CONTAINER_PROJECT_DIR}`,
    '--volume',
    `${mountPaths.nodeModulesDir}:${CONTAINER_NODE_MODULES_DIR}`,
    '--volume',
    `${mountPaths.homeDir}:${CONTAINER_HOME_DIR}`,
    '--volume',
    `${mountPaths.pnpmStoreDir}:${CONTAINER_PNPM_STORE_DIR}`,
    '--volume',
    `${mountPaths.corepackDir}:${CONTAINER_COREPACK_HOME}`,
    '--volume',
    `${mountPaths.homeCacheDir}:${resolve(CONTAINER_HOME_DIR, '.cache')}`,
    '--volume',
    `${mountPaths.electronCacheDir}:${CONTAINER_ELECTRON_CACHE_DIR}`,
    '--volume',
    `${mountPaths.electronBuilderCacheDir}:${CONTAINER_ELECTRON_BUILDER_CACHE_DIR}`,
    imageTag,
    '/bin/bash',
    '-lc',
    createContainerShellCommand(scriptName, forwardedArgs)
  )

  return args
}

export function formatCommandFailure(commandName, action, result) {
  const stdout = typeof result?.stdout === 'string' ? result.stdout : ''
  const stderr = typeof result?.stderr === 'string' ? result.stderr : ''
  const combined = `${stdout}\n${stderr}`.trim()

  if (result?.error?.code === 'ENOENT' && commandName === 'docker') {
    return 'Docker CLI is not installed or is not available on PATH.'
  }

  if (
    commandName === 'docker' &&
    /cannot connect to the docker daemon|error during connect|is the docker daemon running/i.test(
      combined
    )
  ) {
    return 'Docker daemon is unavailable. Start Docker and retry the build.'
  }

  if (combined.length > 0) {
    return `${action} failed.\n${combined}`
  }

  return `${action} failed with exit code ${result?.status ?? 1}.`
}

export function ensureCommandSucceeded(commandName, action, result) {
  if (!result?.error && result?.status === 0) {
    return
  }

  throw new Error(formatCommandFailure(commandName, action, result))
}

export function runCapturedCommand(commandName, args, options = {}, deps = {}) {
  const spawnSyncImpl = deps.spawnSyncImpl ?? spawnSync
  return spawnSyncImpl(commandName, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: false
  })
}

export function runStreamingCommand(commandName, args, options = {}, deps = {}) {
  const spawnImpl = deps.spawnImpl ?? spawn

  return new Promise((resolveResult) => {
    const child = spawnImpl(commandName, args, {
      cwd: options.cwd,
      shell: false,
      stdio: options.stdio ?? 'inherit'
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

export function resolveHostIds(platform = process.platform) {
  assertSupportedDockerBuildHost(platform)

  if (platform === 'win32') {
    return {}
  }

  if (typeof process.getuid !== 'function' || typeof process.getgid !== 'function') {
    throw new Error('Dockerized builds require POSIX uid/gid support on Linux hosts.')
  }

  return {
    uid: process.getuid(),
    gid: process.getgid()
  }
}

export async function runDockerizedBuild(options, deps = {}) {
  const projectDir = resolve(options?.projectDir ?? process.cwd())
  const scriptName = normalizeInternalBuildScript(options?.scriptName)
  const forwardedArgs = Array.isArray(options?.forwardedArgs) ? options.forwardedArgs : []
  const platform = options?.platform ?? process.platform
  const hostIds = options?.hostIds ?? resolveHostIds(platform)
  const mountPaths = createDockerMountPaths(projectDir, options?.hostCacheRoot)
  const identity = createDockerBuildIdentity(projectDir)
  const log = deps.log ?? console.log
  const captureCommandImpl = deps.captureCommandImpl ?? runCapturedCommand
  const streamingCommandImpl = deps.streamingCommandImpl ?? runStreamingCommand

  assertSupportedDockerBuildHost(platform)
  ensureDockerMountPathsExist(mountPaths, deps.mkdirSyncImpl)

  const dockerAvailabilityResult = await captureCommandImpl(
    'docker',
    ['info'],
    { cwd: projectDir },
    deps
  )
  ensureCommandSucceeded('docker', 'Docker availability check', dockerAvailabilityResult)

  for (const step of createHostPreflightSteps(scriptName, platform)) {
    log(`\n[docker-build] ${step.label}`)
    const preflightResult = await streamingCommandImpl(step.command, step.args, { cwd: projectDir }, deps)
    ensureCommandSucceeded(step.command, `Host preflight step "${step.label}"`, preflightResult)
  }

  log('\n[docker-build] Building Docker builder image')
  const dockerBuildResult = await streamingCommandImpl(
    'docker',
    createDockerBuildArgs({
      projectDir,
      imageTag: identity.imageTag
    }),
    { cwd: projectDir },
    deps
  )
  ensureCommandSucceeded('docker', 'Docker builder image build', dockerBuildResult)

  log(`\n[docker-build] Running ${scriptName} inside Docker`)
  const dockerRunResult = await streamingCommandImpl(
    'docker',
    createDockerRunArgs({
      projectDir,
      imageTag: identity.imageTag,
      uid: hostIds.uid,
      gid: hostIds.gid,
      hostPlatform: platform,
      mountPaths,
      scriptName,
      forwardedArgs
    }),
    { cwd: projectDir },
    deps
  )
  ensureCommandSucceeded('docker', 'Dockerized build execution', dockerRunResult)
}

function isCliEntrypoint() {
  const entry = process.argv[1]
  if (!entry) {
    return false
  }
  return pathToFileURL(resolve(entry)).href === import.meta.url
}

async function main(argv = process.argv.slice(2)) {
  const [scriptName, ...forwardedArgs] = argv
  if (!scriptName) {
    throw new Error(
      `Missing internal build script argument. Expected one of: ${SUPPORTED_INTERNAL_BUILD_SCRIPTS.join(', ')}`
    )
  }

  await runDockerizedBuild({
    scriptName,
    forwardedArgs
  })
}

if (isCliEntrypoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
