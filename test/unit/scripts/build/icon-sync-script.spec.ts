import { describe, expect, it } from 'vitest'
import {
  buildLinuxLauncherContent,
  escapeSingleQuotesForBash,
  rewriteDesktopEntryMappings
} from '../../../../scripts/sync-app-icon.mjs'

describe('sync-app-icon script helpers', () => {
  it('escapes single quotes for bash-safe paths', () => {
    expect(escapeSingleQuotesForBash("/tmp/O'Brien/path")).toBe("/tmp/O'\"'\"'Brien/path")
  })

  it('builds launcher content with expected icon and runtime tags', () => {
    const content = buildLinuxLauncherContent({
      displayName: 'Workshop Manager',
      projectRootPath: "/home/yuyu/Desktop/DEV/Steam Projects/O'Brien Mod Manager",
      appId: 'workshop-manager',
      iconAbsolutePath: '/home/yuyu/.local/share/icons/hicolor/512x512/apps/workshop-manager.png'
    })

    expect(content).toContain('Name=Workshop Manager')
    expect(content).toContain('GenericName=Workshop Mod Manager')
    expect(content).toContain('Keywords=workshop;steam;mod;mods;upload;update;publisher;manager;')
    expect(content).toContain('StartupWMClass=workshop-manager')
    expect(content).toContain('Icon=/home/yuyu/.local/share/icons/hicolor/512x512/apps/workshop-manager.png')
    expect(content).toContain('CHROME_DESKTOP=workshop-manager.desktop')
    expect(content).toContain("cd '/home/yuyu/Desktop/DEV/Steam Projects/O'\"'\"'Brien Mod Manager'")
  })

  it('rewrites existing desktop entries to the expected identity', () => {
    const original = `[Desktop Entry]
Type=Application
Name=Old Name
Icon=old-icon
StartupWMClass=old-class
`

    const rewritten = rewriteDesktopEntryMappings(original, {
      displayName: 'Workshop Manager',
      appId: 'workshop-manager',
      iconAbsolutePath: '/tmp/workshop-manager.png'
    })

    expect(rewritten).toContain('Name=Workshop Manager')
    expect(rewritten).toContain('Icon=/tmp/workshop-manager.png')
    expect(rewritten).toContain('StartupWMClass=workshop-manager')
    expect(rewritten).not.toContain('Name=Old Name')
  })

  it('adds missing desktop entry fields when absent', () => {
    const original = `[Desktop Entry]
Type=Application
`

    const rewritten = rewriteDesktopEntryMappings(original, {
      displayName: 'Workshop Manager',
      appId: 'workshop-manager',
      iconAbsolutePath: '/tmp/workshop-manager.png'
    })

    expect(rewritten).toContain('Name=Workshop Manager')
    expect(rewritten).toContain('Icon=/tmp/workshop-manager.png')
    expect(rewritten).toContain('StartupWMClass=workshop-manager')
  })
})
