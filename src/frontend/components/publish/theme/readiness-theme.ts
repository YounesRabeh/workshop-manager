/**
 * Overview: Readiness styling rules for publish checklist items.
 * Responsibility: Computes checklist item tone and status labels from readiness state and feature context.
 */
import type { PublishChecklistItem } from '../../../types/ui'

export interface ReadinessStyleContext {
  isUpdateMode: boolean
  hasContentFolder: boolean
  draftTitle: string
  createAppIdHasInvalidFormat?: boolean
}

/** Returns checklist-item classes based on completion and publish-flow context. */
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

/** Returns status classes for a checklist item in its current context. */
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

/** Returns the status text shown beside a checklist item. */
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
