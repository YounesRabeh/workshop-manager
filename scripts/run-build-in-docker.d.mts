export const SUPPORTED_INTERNAL_BUILD_SCRIPTS: readonly ['build:bundle:native', 'build:exe:native']
export const DEFAULT_DOCKERFILE_PATH: 'docker/builder.Dockerfile'
export const DEFAULT_DOCKER_CONTEXT_PATH: 'docker'
export const DEFAULT_HOST_CACHE_ROOT: string
export const CONTAINER_PROJECT_DIR: '/project'
export const CONTAINER_NODE_MODULES_DIR: '/project/node_modules'
export const CONTAINER_HOME_DIR: '/home/builder'
export const CONTAINER_PNPM_STORE_DIR: '/pnpm/store'
export const CONTAINER_COREPACK_HOME: '/pnpm/corepack'
export const CONTAINER_ELECTRON_CACHE_DIR: '/home/builder/.cache/electron'
export const CONTAINER_ELECTRON_BUILDER_CACHE_DIR: '/home/builder/.cache/electron-builder'

export interface DockerBuildIdentity {
  projectSlug: string
  fingerprint: string
  baseName: string
  imageTag: string
}

export interface DockerMountPaths {
  cacheRoot: string
  homeDir: string
  homeCacheDir: string
  nodeModulesDir: string
  pnpmStoreDir: string
  corepackDir: string
  electronCacheDir: string
  electronBuilderCacheDir: string
}

export interface ShellCommandStep {
  label: string
  command: string
  args: string[]
}

export interface CommandResult {
  status?: number | null
  signal?: string | null
  stdout?: string
  stderr?: string
  error?: { code?: string } | Error
}

export interface CommandOptions {
  cwd?: string
  stdio?: 'inherit' | 'pipe'
}

export interface RunDockerizedBuildOptions {
  projectDir?: string
  scriptName: string
  forwardedArgs?: string[]
  platform?: string
  hostCacheRoot?: string
  hostIds?: { uid: number; gid: number }
}

export interface RunDockerizedBuildDeps {
  mkdirSyncImpl?: (path: string, options?: { recursive?: boolean }) => void
  spawnSyncImpl?: (commandName: string, args: string[], options: object) => CommandResult
  spawnImpl?: (commandName: string, args: string[], options: object) => {
    once(event: string, listener: (...args: any[]) => void): unknown
  }
  captureCommandImpl?: (
    commandName: string,
    args: string[],
    options?: CommandOptions,
    deps?: RunDockerizedBuildDeps
  ) => CommandResult | Promise<CommandResult>
  streamingCommandImpl?: (
    commandName: string,
    args: string[],
    options?: CommandOptions,
    deps?: RunDockerizedBuildDeps
  ) => CommandResult | Promise<CommandResult>
  log?: (value: string) => void
}

export function assertSupportedDockerBuildHost(platform?: string): void
export function normalizeInternalBuildScript(
  scriptName: string
): 'build:bundle:native' | 'build:exe:native'
export function shellEscape(value: unknown): string
export function sanitizeDockerIdentifier(value: unknown): string
export function createProjectFingerprint(projectDir: string): string
export function createDockerBuildIdentity(projectDir: string): DockerBuildIdentity
export function createDockerMountPaths(projectDir: string, hostCacheRoot?: string): DockerMountPaths
export function ensureDockerMountPathsExist(
  mountPaths: Record<string, string>,
  mkdirSyncImpl?: (path: string, options?: { recursive?: boolean }) => void
): void
export function createDockerBuildArgs(input: {
  projectDir: string
  imageTag: string
  dockerfilePath?: string
  contextPath?: string
}): string[]
export function createContainerForwardedArgs(scriptName: string, forwardedArgs?: string[]): string[]
export function createHostPreflightSteps(
  scriptName: string,
  platform?: string
): ShellCommandStep[]
export function createContainerShellCommand(scriptName: string, forwardedArgs?: string[]): string
export function createDockerRunArgs(input: {
  projectDir: string
  imageTag: string
  uid: number
  gid: number
  mountPaths: DockerMountPaths
  scriptName: string
  forwardedArgs?: string[]
}): string[]
export function formatCommandFailure(
  commandName: string,
  action: string,
  result: CommandResult
): string
export function ensureCommandSucceeded(
  commandName: string,
  action: string,
  result: CommandResult
): void
export function runCapturedCommand(
  commandName: string,
  args: string[],
  options?: CommandOptions,
  deps?: RunDockerizedBuildDeps
): CommandResult
export function runStreamingCommand(
  commandName: string,
  args: string[],
  options?: CommandOptions,
  deps?: RunDockerizedBuildDeps
): Promise<CommandResult>
export function resolveHostIds(platform?: string): {
  uid: number
  gid: number
}
export function runDockerizedBuild(
  options: RunDockerizedBuildOptions,
  deps?: RunDockerizedBuildDeps
): Promise<void>
