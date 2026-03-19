import { describe, expect, it } from 'vitest'
import { buildContentTree, mergeContentFiles, useDrafts } from '../../src/frontend/composables/useDrafts'

describe('useDrafts composable', () => {
  it('deduplicates merged content files by absolute path', () => {
    const merged = mergeContentFiles(
      [
        { absolutePath: '/mods/a.txt', relativePath: 'a.txt', sizeBytes: 5 },
        { absolutePath: '/mods/b.txt', relativePath: 'b.txt', sizeBytes: 8 }
      ],
      [
        { absolutePath: '/mods/a.txt', relativePath: 'a.txt', sizeBytes: 5 },
        { absolutePath: '/mods/c.txt', relativePath: 'c.txt', sizeBytes: 10 }
      ]
    )

    expect(merged.map((file) => file.relativePath)).toEqual(['a.txt', 'b.txt', 'c.txt'])
  })

  it('builds folder-first content trees with aggregate sizes', () => {
    const tree = buildContentTree([
      { absolutePath: '/mods/root/readme.txt', relativePath: 'readme.txt', sizeBytes: 4 },
      { absolutePath: '/mods/root/scripts/a.lua', relativePath: 'scripts/a.lua', sizeBytes: 3 },
      { absolutePath: '/mods/root/scripts/b.lua', relativePath: 'scripts/b.lua', sizeBytes: 6 }
    ])

    expect(tree.length).toBe(2)
    expect(tree[0]?.type).toBe('folder')
    expect(tree[0]?.name).toBe('scripts')
    expect(tree[0]?.sizeBytes).toBe(9)
    expect(tree[1]?.name).toBe('readme.txt')
  })

  it('adds create tags once and clears input', () => {
    const drafts = useDrafts()
    drafts.createTagInput.value = 'alpha, beta, alpha'
    drafts.addCreateTag()

    expect(drafts.createDraft.tags).toEqual(['alpha', 'beta'])
    expect(drafts.createTagInput.value).toBe('')
  })
})
