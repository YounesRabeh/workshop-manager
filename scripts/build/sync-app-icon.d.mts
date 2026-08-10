/**
 * Type declarations for `scripts/build/sync-app-icon.mjs`.
 * They document the exported icon helpers and keep script tests typed.
 */
/** Resolves the available ImageMagick executable for icon derivation. */
export function resolveImageMagickCommand(platform?: string): 'magick' | 'convert' | undefined

export interface IconAssetPaths {
  sourceIconPath: string
  normalizedIconPath: string
  sourceIcoPath: string
  sourceIcnsPath: string
  targetIconPaths: string[]
  sourceMarkerPath: string
}

/** Resolves every file the icon sync may read or write beneath the project root. */
export function resolveIconAssetPaths(rootPath: string): IconAssetPaths
