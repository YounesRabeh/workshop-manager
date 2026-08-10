/**
 * Type declarations for `scripts/build/sync-app-icon.mjs`.
 * They document the exported icon helpers and keep script tests typed.
 */
/** Resolves the available ImageMagick executable for icon derivation. */
export function resolveImageMagickCommand(platform?: string): 'magick' | 'convert' | undefined
