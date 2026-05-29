import { access, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SteamCmdScriptRunner } from '@backend/services/steamcmd-script-runner'

describe('SteamCmdScriptRunner', () => {
  it('creates an ephemeral script file and deletes it after execution', async () => {
    const runtimeDir = await mkdtemp(join(tmpdir(), 'steamcmd-script-runner-'))
    try {
      const runner = new SteamCmdScriptRunner(runtimeDir)
      let capturedPath = ''

      const result = await runner.runWithEphemeralScript({
        runId: 'run-1',
        scriptContent: 'login anonymous\nquit\n',
        execute: async (scriptPath) => {
          capturedPath = scriptPath
          const content = await readFile(scriptPath, 'utf8')
          expect(content).toBe('login anonymous\nquit\n')

          if (process.platform !== 'win32') {
            const fileStat = await stat(scriptPath)
            expect(fileStat.mode & 0o777).toBe(0o600)
          }

          return 'ok'
        }
      })

      expect(result).toBe('ok')
      await expect(access(capturedPath)).rejects.toThrow()
    } finally {
      await rm(runtimeDir, { recursive: true, force: true })
    }
  })

  it('deletes script files even when execution throws', async () => {
    const runtimeDir = await mkdtemp(join(tmpdir(), 'steamcmd-script-runner-'))
    try {
      const runner = new SteamCmdScriptRunner(runtimeDir)
      await expect(
        runner.runWithEphemeralScript({
          runId: 'run-2',
          scriptContent: 'login anonymous\nquit\n',
          execute: async () => {
            throw new Error('boom')
          }
        })
      ).rejects.toThrow('boom')

      const scriptsDir = join(runtimeDir, 'scripts')
      const files = await readdir(scriptsDir)
      expect(files).toHaveLength(0)
    } finally {
      await rm(runtimeDir, { recursive: true, force: true })
    }
  })

  it('purges stale script files from runtime scripts directory', async () => {
    const runtimeDir = await mkdtemp(join(tmpdir(), 'steamcmd-script-runner-'))
    try {
      const scriptsDir = join(runtimeDir, 'scripts')
      await mkdir(scriptsDir, { recursive: true })
      await writeFile(join(scriptsDir, 'first.txt'), 'a', 'utf8')
      await writeFile(join(scriptsDir, 'second.txt'), 'b', 'utf8')
      await writeFile(join(scriptsDir, 'keep.log'), 'c', 'utf8')

      const runner = new SteamCmdScriptRunner(runtimeDir)
      const removed = await runner.purgeStaleScripts()
      const remaining = (await readdir(scriptsDir)).sort()

      expect(removed).toBe(2)
      expect(remaining).toEqual(['keep.log'])
    } finally {
      await rm(runtimeDir, { recursive: true, force: true })
    }
  })

  it('validates run identifiers and script content', async () => {
    const runtimeDir = await mkdtemp(join(tmpdir(), 'steamcmd-script-runner-'))
    try {
      const runner = new SteamCmdScriptRunner(runtimeDir)
      await expect(
        runner.runWithEphemeralScript({
          runId: '',
          scriptContent: 'login anonymous\nquit\n',
          execute: async () => undefined
        })
      ).rejects.toThrow('runId is required')

      await expect(
        runner.runWithEphemeralScript({
          runId: 'run-3',
          scriptContent: '  ',
          execute: async () => undefined
        })
      ).rejects.toThrow('script content is empty')
    } finally {
      await rm(runtimeDir, { recursive: true, force: true })
    }
  })
})
