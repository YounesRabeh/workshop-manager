import { describe, expect, it } from 'vitest'
import { buildContentTree, mergeContentFiles } from '@frontend/composables/useDrafts'

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

  it('preserves distinct files that differ only by case-sensitive path segments', () => {
    const merged = mergeContentFiles(
      [
        { absolutePath: '/mods/Foo.txt', relativePath: 'Foo.txt', sizeBytes: 5 }
      ],
      [
        { absolutePath: '/mods/foo.txt', relativePath: 'foo.txt', sizeBytes: 8 }
      ]
    )

    expect(merged).toHaveLength(2)
    expect(merged.map((file) => file.relativePath).sort()).toEqual(['Foo.txt', 'foo.txt'])
  })
})
