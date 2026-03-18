import { describe, expect, it } from 'vitest'
import {
  buildStepsForPlatform,
  getElectronBuilderArgsForPlatform,
  getPackagingTargetForPlatform,
  parseBuildExecutableOptions,
  resolvePnpmCommand
} from '../../scripts/build-executable.mjs'

describe('build-executable script helpers', () => {
  it('maps platform to packaging target correctly', () => {
    expect(getPackagingTargetForPlatform('win32')).toEqual({ platformArg: '--win', target: 'nsis' })
    expect(getPackagingTargetForPlatform('darwin')).toEqual({ platformArg: '--mac', target: 'dmg' })
    expect(getPackagingTargetForPlatform('linux')).toEqual({
      platformArg: '--linux',
      target: 'AppImage'
    })
  })

  it('throws for unsupported platforms', () => {
    expect(() => getPackagingTargetForPlatform('freebsd')).toThrow(
      'Unsupported platform for executable packaging: freebsd'
    )
  })

  it('builds electron-builder args with publish disabled', () => {
    expect(getElectronBuilderArgsForPlatform('linux')).toEqual([
      'exec',
      'electron-builder',
      '--linux',
      'AppImage',
      '--publish',
      'never'
    ])
  })

  it('uses pnpm.cmd on windows and pnpm on unix-like systems', () => {
    expect(resolvePnpmCommand('win32')).toBe('pnpm.cmd')
    expect(resolvePnpmCommand('linux')).toBe('pnpm')
    expect(resolvePnpmCommand('darwin')).toBe('pnpm')
  })

  it('builds steps in required default order for linux', () => {
    const steps = buildStepsForPlatform('linux')
    expect(steps.map((s) => s.label)).toEqual([
      'Kill old app instance',
      'Build app bundles',
      'Package executable artifacts'
    ])
    expect(steps[0]).toMatchObject({ command: 'pnpm', args: ['kill:instance'] })
    expect(steps[1]).toMatchObject({ command: 'pnpm', args: ['build:bundle'] })
    expect(steps[2]).toMatchObject({
      command: 'pnpm',
      args: ['exec', 'electron-builder', '--linux', 'AppImage', '--publish', 'never']
    })
  })

  it('includes icon sync step only when generateIcon is enabled', () => {
    const steps = buildStepsForPlatform('linux', { generateIcon: true })
    expect(steps.map((s) => s.label)).toEqual([
      'Kill old app instance',
      'Sync icon assets',
      'Build app bundles',
      'Package executable artifacts'
    ])
    expect(steps[1]).toMatchObject({ command: 'pnpm', args: ['sync:icon'] })
  })

  it('parses generate icon flag from argv', () => {
    expect(parseBuildExecutableOptions([])).toEqual({ generateIcon: false })
    expect(parseBuildExecutableOptions(['--generate-icon'])).toEqual({ generateIcon: true })
  })
})
