import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl, LocalImagePreviewAccess } from '../../../../src/electron/ipc-security'

describe('IPC security helpers', () => {
  it('allows web URLs and rejects local or custom protocols', () => {
    expect(isSafeExternalUrl('https://steamcommunity.com/sharedfiles/filedetails/?id=1')).toBe(true)
    expect(isSafeExternalUrl('http://localhost:3000')).toBe(true)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('steam://open/main')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })

  it('loads only explicitly approved files with a matching image signature', async () => {
    const root = await mkdtemp(join(tmpdir(), 'image-preview-access-'))
    const imagePath = join(root, 'preview.png')
    const disguisedTextPath = join(root, 'secret.png')
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
    await writeFile(imagePath, pngBytes)
    await writeFile(disguisedTextPath, 'not an image', 'utf8')
    const access = new LocalImagePreviewAccess()

    expect(await access.load(imagePath)).toBeUndefined()
    expect(await access.approve(imagePath)).toBe(true)
    expect(await access.load(imagePath)).toBe(`data:image/png;base64,${pngBytes.toString('base64')}`)
    expect(await access.approve(disguisedTextPath)).toBe(true)
    expect(await access.load(disguisedTextPath)).toBeUndefined()
  })
})
