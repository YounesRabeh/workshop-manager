import { describe, expect, it } from 'vitest'
import { SKIP_KILL_INSTANCE_FLAG } from '../../scripts/build-executable.mjs'
import {
  CONTAINER_COREPACK_HOME,
  CONTAINER_ELECTRON_BUILDER_CACHE_DIR,
  CONTAINER_ELECTRON_CACHE_DIR,
  CONTAINER_HOME_DIR,
  CONTAINER_NODE_MODULES_DIR,
  CONTAINER_PNPM_STORE_DIR,
  CONTAINER_PROJECT_DIR,
  DEFAULT_DOCKER_CONTEXT_PATH,
  assertSupportedDockerBuildHost,
  createContainerForwardedArgs,
  createContainerShellCommand,
  createDockerBuildArgs,
  createDockerBuildIdentity,
  createDockerMountPaths,
  createDockerRunArgs,
  createHostPreflightSteps,
  ensureCommandSucceeded,
  resolveHostIds,
  runDockerizedBuild
} from '../../scripts/run-build-in-docker.mjs'

describe('run-build-in-docker script helpers', () => {
  it('adds the internal skip-kill flag only for containerized packaging runs', () => {
    expect(createContainerForwardedArgs('build:bundle:native')).toEqual([])
    expect(createContainerForwardedArgs('build:exe:native', ['--win'])).toEqual([
      '--win',
      SKIP_KILL_INSTANCE_FLAG
    ])
  })

  it('builds the container shell command with install-first behavior and forwarded args', () => {
    expect(createContainerShellCommand('build:exe:native', ['--win', '--generate-icon'])).toBe(
      `pnpm install --frozen-lockfile && pnpm run 'build:exe:native' -- '--win' '--generate-icon' '${SKIP_KILL_INSTANCE_FLAG}'`
    )
  })

  it('builds docker image args from the repo-local dockerfile', () => {
    expect(
      createDockerBuildArgs({
        projectDir: '/workspace/mod-manager',
        imageTag: 'mod-manager:test'
      })
    ).toEqual([
      'build',
      '--file',
      '/workspace/mod-manager/docker/builder.Dockerfile',
      '--tag',
      'mod-manager:test',
      `/workspace/mod-manager/${DEFAULT_DOCKER_CONTEXT_PATH}`
    ])
  })

  it('uses a stable host cache root for persistent Docker mounts', () => {
    const mountPaths = createDockerMountPaths('/workspace/Mod Manager', '/var/cache/workshop-manager')
    expect(mountPaths.cacheRoot).toMatch(/^\/var\/cache\/workshop-manager\/mod-manager-[a-f0-9]{12}$/)
    expect(mountPaths.nodeModulesDir).toMatch(/\/node_modules$/)
  })

  it('builds docker run args with uid/gid and persistent mounts', () => {
    const projectDir = '/workspace/Mod Manager'
    const mountPaths = createDockerMountPaths(projectDir, '/var/cache/workshop-manager')
    const args = createDockerRunArgs({
      projectDir,
      imageTag: 'mod-manager:test',
      uid: 1000,
      gid: 1001,
      hostPlatform: 'linux',
      mountPaths,
      scriptName: 'build:exe:native',
      forwardedArgs: ['--win']
    })

    expect(args).toEqual(
      expect.arrayContaining([
        'run',
        '--rm',
        '--user',
        '1000:1001',
        '--workdir',
        CONTAINER_PROJECT_DIR,
        '--security-opt',
        'label=disable',
        '--env',
        `HOME=${CONTAINER_HOME_DIR}`,
        '--env',
        `PNPM_STORE_DIR=${CONTAINER_PNPM_STORE_DIR}`,
        '--env',
        `COREPACK_HOME=${CONTAINER_COREPACK_HOME}`,
        '--env',
        `ELECTRON_CACHE=${CONTAINER_ELECTRON_CACHE_DIR}`,
        '--env',
        `ELECTRON_BUILDER_CACHE=${CONTAINER_ELECTRON_BUILDER_CACHE_DIR}`,
        '--volume',
        `${projectDir}:${CONTAINER_PROJECT_DIR}`,
        '--volume',
        `${mountPaths.nodeModulesDir}:${CONTAINER_NODE_MODULES_DIR}`,
        '--volume',
        `${mountPaths.homeDir}:${CONTAINER_HOME_DIR}`,
        '--volume',
        `${mountPaths.pnpmStoreDir}:${CONTAINER_PNPM_STORE_DIR}`,
        '--volume',
        `${mountPaths.corepackDir}:${CONTAINER_COREPACK_HOME}`,
        '--volume',
        `${mountPaths.homeCacheDir}:${CONTAINER_HOME_DIR}/.cache`,
        '--volume',
        `${mountPaths.electronCacheDir}:${CONTAINER_ELECTRON_CACHE_DIR}`,
        '--volume',
        `${mountPaths.electronBuilderCacheDir}:${CONTAINER_ELECTRON_BUILDER_CACHE_DIR}`,
        'mod-manager:test',
        '/bin/bash',
        '-lc',
        `pnpm install --frozen-lockfile && pnpm run 'build:exe:native' -- '--win' '${SKIP_KILL_INSTANCE_FLAG}'`
      ])
    )
  })

  it('creates host preflight steps for dockerized builds', () => {
    expect(createHostPreflightSteps('build:bundle:native', 'linux')).toEqual([
      {
        label: 'Kill old host app instance',
        command: 'pnpm',
        args: ['kill:instance']
      }
    ])
  })

  it('uses the Windows pnpm shim for dockerized preflight steps on win32 hosts', () => {
    expect(createHostPreflightSteps('build:exe:native', 'win32')).toEqual([
      {
        label: 'Kill old host app instance',
        command: 'pnpm.cmd',
        args: ['kill:instance']
      }
    ])
  })

  it('runs docker availability, host preflight, docker build, and docker run in order', async () => {
    const projectDir = '/workspace/Mod Manager'
    const identity = createDockerBuildIdentity(projectDir)
    const mountPaths = createDockerMountPaths(projectDir, '/var/cache/workshop-manager')
    const mkdirCalls: string[] = []
    const captureCalls: Array<{ commandName: string; args: string[]; cwd?: string }> = []
    const streamingCalls: Array<{ commandName: string; args: string[]; cwd?: string }> = []

    await runDockerizedBuild(
      {
        projectDir,
        scriptName: 'build:exe:native',
        forwardedArgs: ['--win', '--generate-icon'],
        platform: 'linux',
        hostCacheRoot: '/var/cache/workshop-manager',
        hostIds: { uid: 1000, gid: 1000 }
      },
      {
        log: () => undefined,
        mkdirSyncImpl: (targetPath) => {
          mkdirCalls.push(targetPath)
        },
        captureCommandImpl: (commandName, args, options) => {
          captureCalls.push({
            commandName,
            args,
            cwd: typeof options === 'object' && options !== null && 'cwd' in options
              ? (options as { cwd?: string }).cwd
              : undefined
          })
          return { status: 0, stdout: '', stderr: '' }
        },
        streamingCommandImpl: (commandName, args, options) => {
          streamingCalls.push({
            commandName,
            args,
            cwd: typeof options === 'object' && options !== null && 'cwd' in options
              ? (options as { cwd?: string }).cwd
              : undefined
          })
          return { status: 0 }
        }
      }
    )

    expect(mkdirCalls).toEqual(expect.arrayContaining(Object.values(mountPaths)))
    expect(captureCalls).toEqual([
      {
        commandName: 'docker',
        args: ['info'],
        cwd: projectDir
      }
    ])
    expect(streamingCalls).toEqual([
      {
        commandName: 'pnpm',
        args: ['kill:instance'],
        cwd: projectDir
      },
      {
        commandName: 'docker',
        args: createDockerBuildArgs({
          projectDir,
          imageTag: identity.imageTag
        }),
        cwd: projectDir
      },
      {
        commandName: 'docker',
        args: createDockerRunArgs({
          projectDir,
          imageTag: identity.imageTag,
          uid: 1000,
          gid: 1000,
          hostPlatform: 'linux',
          mountPaths,
          scriptName: 'build:exe:native',
          forwardedArgs: ['--win', '--generate-icon']
        }),
        cwd: projectDir
      }
    ])
  })

  it('reports missing docker clearly', () => {
    expect(() =>
      ensureCommandSucceeded('docker', 'Docker builder image build', {
        error: { code: 'ENOENT' },
        status: null,
        stdout: '',
        stderr: ''
      })
    ).toThrow('Docker CLI is not installed or is not available on PATH.')
  })

  it('reports docker daemon connection failures clearly', () => {
    expect(() =>
      ensureCommandSucceeded('docker', 'Dockerized build execution', {
        status: 1,
        stdout: '',
        stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?'
      })
    ).toThrow('Docker daemon is unavailable. Start Docker and retry the build.')
  })

  it('accepts linux and windows docker build hosts but rejects unsupported hosts', () => {
    expect(() => assertSupportedDockerBuildHost('linux')).not.toThrow()
    expect(() => assertSupportedDockerBuildHost('win32')).not.toThrow()
    expect(() => assertSupportedDockerBuildHost('darwin')).toThrow(
      'Dockerized builds are currently supported on Linux and Windows hosts only. Current host: darwin'
    )
  })

  it('omits linux-only docker run flags on win32 hosts', () => {
    const projectDir = '/workspace/Mod Manager'
    const mountPaths = createDockerMountPaths(projectDir, '/var/cache/workshop-manager')
    const args = createDockerRunArgs({
      projectDir,
      imageTag: 'mod-manager:test',
      hostPlatform: 'win32',
      mountPaths,
      scriptName: 'build:exe:native',
      forwardedArgs: ['--linux']
    })

    expect(args).toContain('run')
    expect(args).not.toContain('--user')
    expect(args).not.toContain('--security-opt')
    expect(args).toContain(`${projectDir}:${CONTAINER_PROJECT_DIR}`)
  })

  it('returns empty host ids on win32 docker hosts', () => {
    expect(resolveHostIds('win32')).toEqual({})
  })
})
