/**
 * Overview: Steam Workshop visibility metadata for publish flows.
 * Responsibility: Defines supported visibility values and maps them to human-readable labels, hints, and tooltips.
 */
export const visibilityOptions = [0, 1, 2, 3] as const

export type PublishVisibility = (typeof visibilityOptions)[number]

export function visibilityLabel(value: PublishVisibility): string {
  if (value === 0) return 'Public'
  if (value === 1) return 'Friends-only'
  if (value === 2) return 'Hidden'
  return 'Unlisted'
}

export function visibilityHint(value: PublishVisibility): string {
  if (value === 0) {
    return 'This item is visible to everyone and can appear in searches and on your profile.'
  }
  if (value === 1) {
    return 'This item is only visible in searches to you, your friends, and admins.'
  }
  if (value === 2) {
    return 'This item is only visible to you, admins, and anyone marked as a creator.'
  }
  return 'This item is visible to everyone, but will not show up in searches or on your profile.'
}

export function visibilityTooltip(value: PublishVisibility): string {
  return `${visibilityLabel(value)}: ${visibilityHint(value)}`
}
