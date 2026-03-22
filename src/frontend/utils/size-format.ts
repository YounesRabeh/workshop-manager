/**
 * Overview: Small utility for rendering byte counts as readable size labels.
 * Responsibility: Normalizes raw byte input and formats it into B/KB/MB/GB units for UI display.
 */
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const

export function formatSizeLabel(sizeBytes: number): string {
  const sanitized = Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0
  if (sanitized < 1024) {
    return `${Math.trunc(sanitized)} B`
  }

  let value = sanitized
  let unitIndex = 0
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(1)} ${SIZE_UNITS[unitIndex]}`
}
