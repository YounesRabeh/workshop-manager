import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('sync-app-icon script', () => {
  it('does not create or update Linux desktop launchers', async () => {
    const scriptUrl = new URL('../../../../scripts/build/sync-app-icon.mjs', import.meta.url)
    const script = await readFile(scriptUrl, 'utf8')

    expect(script).not.toContain('.local/share/applications')
    expect(script).not.toContain('Desktop/Workshop-Manager.desktop')
    expect(script).not.toContain('Desktop/Steam-Workshop-Manager.desktop')
    expect(script).not.toContain('gtk-update-icon-cache')
  })
})
