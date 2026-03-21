/**
 * Overview: publish-readiness.ts module in frontend/components/publish.
 * Responsibility: Holds the primary logic/exports for this area of the app.
 */
import type { PublishChecklistItem } from '../../types/ui'

export interface ReadinessStyleContext {
  isUpdateMode: boolean
  hasContentFolder: boolean
  draftTitle: string
  createAppIdHasInvalidFormat?: boolean
}

export function readinessItemClass(item: PublishChecklistItem, context: ReadinessStyleContext): string {
  if (
    context.isUpdateMode &&
    item.label === 'Title' &&
    !item.ok &&
    context.draftTitle.trim().length === 0
  ) {
    return 'border-rose-400/45 bg-rose-500/18'
  }
  if (item.label === 'Release notes' && !context.hasContentFolder) {
    return 'border-[#2a3542] bg-[#0a111a] opacity-60'
  }
  if (item.label === 'Release notes' && context.hasContentFolder && !item.ok) {
    return 'border-[#e0b26f]/60 bg-[#7a4f21]/30'
  }
  if (item.ok) {
    return 'border-emerald-400/45 bg-emerald-500/18'
  }
  if (item.optional) {
    return 'border-slate-600/70 bg-slate-900/35'
  }
  return 'border-rose-400/45 bg-rose-500/18'
}

export function readinessStatusClass(item: PublishChecklistItem, context: ReadinessStyleContext): string {
  if (
    context.isUpdateMode &&
    item.label === 'Title' &&
    !item.ok &&
    context.draftTitle.trim().length === 0
  ) {
    return 'text-rose-200'
  }
  if (item.label === 'Release notes' && !context.hasContentFolder) {
    return 'text-slate-600'
  }
  if (item.label === 'Release notes' && context.hasContentFolder && !item.ok) {
    return 'text-amber-200'
  }
  if (item.ok) {
    return 'text-emerald-200'
  }
  if (item.optional) {
    return 'text-slate-300'
  }
  return 'text-rose-200'
}

export function readinessStatusLabel(item: PublishChecklistItem, context: ReadinessStyleContext): string {
  if (
    context.isUpdateMode &&
    item.label === 'Title' &&
    !item.ok &&
    context.draftTitle.trim().length === 0
  ) {
    return 'Missing'
  }
  if (item.label === 'Release notes' && !context.hasContentFolder) {
    return 'Not needed'
  }
  if (item.label === 'Release notes' && context.hasContentFolder && !item.ok) {
    return 'Better if present'
  }
  if (item.ok) {
    return 'OK'
  }
  if (
    !context.isUpdateMode &&
    item.label === 'App ID' &&
    !item.ok &&
    context.createAppIdHasInvalidFormat
  ) {
    return 'Invalid'
  }
  return item.optional ? 'Optional' : 'Missing'
}

export function splitReadinessItems(items: PublishChecklistItem[]): {
  top: PublishChecklistItem[]
  secondary: PublishChecklistItem[]
} {
  const topLabels = ['App ID', 'Title'] as const
  const top = topLabels
    .map((label) => items.find((item) => item.label === label))
    .filter((item): item is PublishChecklistItem => Boolean(item))
  const secondary = items.filter((item) => !topLabels.includes(item.label as (typeof topLabels)[number]))
  return { top, secondary }
}
