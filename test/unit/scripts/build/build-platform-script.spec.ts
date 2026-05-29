import { describe, expect, it } from 'vitest'
import {
  createBuildPlatformSteps,
  createDockerBuildStep,
  normalizeBuildTarget,
  parseBuildPlatformOptions
} from '../../../../scripts/build/build-platform.mjs'

describe('build-platform script helpers', () => {
  it('normalizes public build targets', () => {
    expect(normalizeBuildTarget()).toBe('bundle')
    expect(normalizeBuildTarget('windows')).toBe('win')
    expect(normalizeBuildTarget('all')).toBe('all')
    expect(() => normalizeBuildTarget('freebsd')).toThrow(
      'Unsupported build target "freebsd"'
    )
  })

  it('parses target, checksum, and icon options', () => {
    expect(parseBuildPlatformOptions([])).toEqual({
      target: 'bundle',
      checksums: false,
      icons: true
    })
    expect(parseBuildPlatformOptions(['win', '--checksums', '--skip-icons'])).toEqual({
      target: 'win',
      checksums: true,
      icons: false
    })
  })

  it('creates docker packaging steps with explicit platform flags and icon generation', () => {
    expect(createDockerBuildStep('linux')).toMatchObject({
      command: process.execPath,
      args: [
        'scripts/build/run-build-in-docker.mjs',
        'build:exe:native',
        '--linux',
        '--generate-icon'
      ]
    })

    expect(createDockerBuildStep('win', { icons: false })).toMatchObject({
      args: [
        'scripts/build/run-build-in-docker.mjs',
        'build:exe:native',
        '--win'
      ]
    })
  })

  it('builds a bundle with one host icon step before the docker bundle build', () => {
    expect(createBuildPlatformSteps({ target: 'bundle' }, 'linux')).toEqual([
      {
        label: 'Generate icon assets',
        command: 'pnpm',
        args: ['icon']
      },
      {
        label: 'Build production bundle',
        command: process.execPath,
        args: ['scripts/build/run-build-in-docker.mjs', 'build:bundle:native']
      }
    ])
  })

  it('builds release targets and checksums for all', () => {
    expect(createBuildPlatformSteps({ target: 'all', checksums: true }, 'win32')).toEqual([
      {
        label: 'Build linux package',
        command: process.execPath,
        args: [
          'scripts/build/run-build-in-docker.mjs',
          'build:exe:native',
          '--linux',
          '--generate-icon'
        ]
      },
      {
        label: 'Build win package',
        command: process.execPath,
        args: [
          'scripts/build/run-build-in-docker.mjs',
          'build:exe:native',
          '--win',
          '--generate-icon'
        ]
      },
      {
        label: 'Generate release checksums',
        command: 'pnpm.cmd',
        args: ['checksums']
      }
    ])
  })
})
