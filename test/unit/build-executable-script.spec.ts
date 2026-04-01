import { describe, expect, it } from 'vitest'
import {
  NATIVE_BUNDLE_SCRIPT,
  SKIP_KILL_INSTANCE_FLAG,
  buildStepsForPlatform,
  getElectronBuilderArgsForPlatform,
  getPackagingTargetForPlatform,
  normalizeBuildTargetPlatform,
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
      '--linux',
      'AppImage',
      '--publish',
      'never'
    ])
  })

  it('normalizes supported target platforms and rejects unsupported ones', () => {
    expect(normalizeBuildTargetPlatform('win32')).toBe('win32')
    expect(normalizeBuildTargetPlatform('darwin')).toBe('darwin')
    expect(normalizeBuildTargetPlatform('linux')).toBe('linux')
    expect(() => normalizeBuildTargetPlatform('freebsd')).toThrow(
      'Unsupported target platform for executable packaging: freebsd'
    )
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
    expect(steps[1]).toMatchObject({ command: 'pnpm', args: [NATIVE_BUNDLE_SCRIPT] })
    expect(steps[2]).toMatchObject({
      command: process.execPath,
      args: expect.arrayContaining(['--linux', 'AppImage', '--publish', 'never'])
    })
    expect(steps[2].args[0]).toMatch(/electron-builder[\\/]cli\.js$/)
  })

  it('builds windows packaging steps from a linux host with a fresh bundle first', () => {
    const steps = buildStepsForPlatform('linux', { targetPlatform: 'win32' })
    expect(steps.map((s) => s.label)).toEqual([
      'Kill old app instance',
      'Build app bundles',
      'Package executable artifacts'
    ])
    expect(steps[0]).toMatchObject({ command: 'pnpm', args: ['kill:instance'] })
    expect(steps[1]).toMatchObject({ command: 'pnpm', args: [NATIVE_BUNDLE_SCRIPT] })
    expect(steps[2]).toMatchObject({
      command: process.execPath,
      args: expect.arrayContaining(['--win', 'nsis', '--publish', 'never'])
    })
    expect(steps[2].args[0]).toMatch(/electron-builder[\\/]cli\.js$/)
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

  it('parses generate icon and explicit target platform flags from argv', () => {
    expect(parseBuildExecutableOptions([])).toEqual({
      generateIcon: false,
      skipKillInstance: false,
      targetPlatform: undefined
    })
    expect(parseBuildExecutableOptions(['--generate-icon'])).toEqual({
      generateIcon: true,
      skipKillInstance: false,
      targetPlatform: undefined
    })
    expect(parseBuildExecutableOptions(['--win'])).toEqual({
      generateIcon: false,
      skipKillInstance: false,
      targetPlatform: 'win32'
    })
    expect(parseBuildExecutableOptions(['--platform=linux', '--generate-icon'])).toEqual({
      generateIcon: true,
      skipKillInstance: false,
      targetPlatform: 'linux'
    })
  })

  it('skips host kill step when the internal skip flag is present', () => {
    expect(parseBuildExecutableOptions([SKIP_KILL_INSTANCE_FLAG])).toEqual({
      generateIcon: false,
      skipKillInstance: true,
      targetPlatform: undefined
    })

    const steps = buildStepsForPlatform('linux', { skipKillInstance: true })
    expect(steps.map((s) => s.label)).toEqual([
      'Build app bundles',
      'Package executable artifacts'
    ])
  })

  it('rejects conflicting target platform flags', () => {
    expect(() => parseBuildExecutableOptions(['--win', '--linux'])).toThrow(
      'Conflicting target platforms requested: win32, linux'
    )
  })
})
