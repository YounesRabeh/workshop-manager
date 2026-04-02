import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import {
  SUPPORTED_ELECTRON_VITE_COMMANDS,
  createElectronViteArgs,
  createElectronViteEnv,
  normalizeElectronViteCommand,
  runElectronViteCommand
} from '../../scripts/run-electron-vite-command.mjs'

describe('run-electron-vite-command helpers', () => {
  it('exports the supported command list', () => {
    expect(SUPPORTED_ELECTRON_VITE_COMMANDS).toEqual(['dev', 'preview'])
  })

  it('normalizes supported commands and rejects unsupported ones', () => {
    expect(normalizeElectronViteCommand('dev')).toBe('dev')
    expect(normalizeElectronViteCommand('preview')).toBe('preview')
    expect(() => normalizeElectronViteCommand('build')).toThrow(
      'Unsupported electron-vite command "build". Expected one of: dev, preview'
    )
  })

  it('builds pnpm exec args for the requested command', () => {
    expect(createElectronViteArgs('dev')).toEqual(['exec', 'electron-vite', 'dev'])
    expect(createElectronViteArgs('preview', ['--host'])).toEqual([
      'exec',
      'electron-vite',
      'preview',
      '--host'
    ])
  })

  it('removes ELECTRON_RUN_AS_NODE and keeps the desktop hint only on linux', () => {
    expect(
      createElectronViteEnv('linux', {
        ELECTRON_RUN_AS_NODE: '1',
        PATH: '/usr/bin'
      })
    ).toEqual({
      CHROME_DESKTOP: 'workshop-manager.desktop',
      PATH: '/usr/bin'
    })

    expect(
      createElectronViteEnv('win32', {
        ELECTRON_RUN_AS_NODE: '1',
        CHROME_DESKTOP: 'workshop-manager.desktop',
        PATH: 'C:\\pnpm'
      })
    ).toEqual({
      PATH: 'C:\\pnpm'
    })
  })

  it('spawns pnpm with the normalized environment', async () => {
    let capturedCommandName = ''
    let capturedArgs: string[] = []
    let capturedEnv: NodeJS.ProcessEnv | undefined

    const resultPromise = runElectronViteCommand(
      {
        commandName: 'dev',
        forwardedArgs: ['--host'],
        platform: 'win32'
      },
      {
        baseEnv: {
          ELECTRON_RUN_AS_NODE: '1',
          PATH: 'C:\\pnpm'
        },
        spawnImpl: (commandName, args, options) => {
          capturedCommandName = commandName
          capturedArgs = args
          capturedEnv =
            typeof options === 'object' && options !== null && 'env' in options
              ? (options as { env?: NodeJS.ProcessEnv }).env
              : undefined

          const child = new EventEmitter()
          queueMicrotask(() => child.emit('close', 0, null))
          return child
        }
      }
    )

    await expect(resultPromise).resolves.toEqual({
      status: 0,
      signal: null
    })
    expect(capturedCommandName).toBe('pnpm.cmd')
    expect(capturedArgs).toEqual(['exec', 'electron-vite', 'dev', '--host'])
    expect(capturedEnv).toEqual({
      PATH: 'C:\\pnpm'
    })
  })
})
