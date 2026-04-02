import { describe, expect, it } from 'vitest'
import { buildPowershellKillScript, isTargetProcessForProject } from '../../../../scripts/runtime/kill-old-instance.mjs'

describe('kill-old-instance script helpers', () => {
  const projectRoot = '/home/yuyu/Desktop/DEV/Steam Projects/Mod Manager'

  it('targets workshop manager electron processes from this project', () => {
    const command = `${projectRoot}/node_modules/.bin/electron out/main/index.js --some-flag`
    expect(isTargetProcessForProject(command, projectRoot)).toBe(true)
  })

  it('does not target unrelated processes', () => {
    const command = '/usr/bin/python3 /tmp/other-project/script.py'
    expect(isTargetProcessForProject(command, projectRoot)).toBe(false)
  })

  it('does not target the kill script itself', () => {
    const command = `node ${projectRoot}/scripts/runtime/kill-old-instance.mjs`
    expect(isTargetProcessForProject(command, projectRoot)).toBe(false)
  })

  it('keeps backward compatibility for legacy app names', () => {
    const command = 'steam-workshop-manager --electron-vite'
    expect(isTargetProcessForProject(command, projectRoot)).toBe(true)
  })

  it('builds powershell kill script with escaped root path and matchers', () => {
    const script = buildPowershellKillScript("/tmp/O'Brien/Workshop Manager")
    expect(script).toContain("$root = '/tmp/O''Brien/Workshop Manager'")
    expect(script).toContain('workshop-manager')
    expect(script).toContain('steam-workshop-manager')
    expect(script).toContain('Stop-Process -Id $proc.ProcessId -Force')
  })
})
