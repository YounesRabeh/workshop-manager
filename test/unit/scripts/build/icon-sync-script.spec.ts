import { isAbsolute, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveIconAssetPaths } from '../../../../scripts/build/sync-app-icon.mjs'

describe('sync-app-icon script', () => {
  it('keeps every generated icon asset inside the project', () => {
    const projectRoot = resolve('/tmp', 'workshop-manager-project')
    const paths = resolveIconAssetPaths(projectRoot)
    const outputPaths = [
      paths.normalizedIconPath,
      paths.sourceIcoPath,
      paths.sourceIcnsPath,
      ...paths.targetIconPaths,
      paths.sourceMarkerPath
    ]

    expect(paths.sourceIconPath).toBe(resolve(projectRoot, 'resources/img/app-icon.png'))
    expect(outputPaths).not.toHaveLength(0)
    for (const outputPath of outputPaths) {
      const projectRelativePath = relative(projectRoot, outputPath)
      expect(isAbsolute(projectRelativePath)).toBe(false)
      expect(projectRelativePath).not.toBe('..')
      expect(projectRelativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)).toBe(false)
    }
  })
})
