/**
 * Overview: Readiness grouping helpers for publish checklist items.
 * Responsibility: Splits checklist items into primary and secondary groups for create/update publish flows.
 */
import type { PublishChecklistItem } from '../../../types/ui'

export interface ReadinessGroups {
  primary: PublishChecklistItem[]
  secondary: PublishChecklistItem[]
}

export function splitCreateReadinessItems(items: PublishChecklistItem[]): ReadinessGroups {
  const primaryLabels = ['App ID', 'Title', 'Content folder'] as const
  const primary = primaryLabels
    .map((label) => items.find((item) => item.label === label))
    .filter((item): item is PublishChecklistItem => Boolean(item))
  const secondary = items.filter((item) => !primaryLabels.includes(item.label as (typeof primaryLabels)[number]))
  return { primary, secondary }
}

export function splitUpdateReadinessItems(items: PublishChecklistItem[]): ReadinessGroups {
  const primaryLabels = ['App ID', 'Title'] as const
  const primary = primaryLabels
    .map((label) => items.find((item) => item.label === label))
    .filter((item): item is PublishChecklistItem => Boolean(item))
  const secondary = items.filter((item) => !primaryLabels.includes(item.label as (typeof primaryLabels)[number]))
  return { primary, secondary }
}
