/**
 * Overview: Content-explorer state helpers for publish section panels.
 * Responsibility: Flattens staged file trees and manages collapsed/expanded folder state plus explorer toggle behavior.
 */
import { computed, ref, watch, type ComputedRef } from 'vue'
import type { ContentTreeNode } from '../../../types/ui'

export interface FlattenedContentNode {
  node: ContentTreeNode
  depth: number
}

export function flattenContentTree(
  nodes: ContentTreeNode[],
  collapsedFolderIds: ReadonlySet<string>,
  depth = 0
): FlattenedContentNode[] {
  const rows: FlattenedContentNode[] = []
  for (const node of nodes) {
    rows.push({ node, depth })
    if (
      node.type === 'folder' &&
      node.children &&
      node.children.length > 0 &&
      !collapsedFolderIds.has(node.id)
    ) {
      rows.push(...flattenContentTree(node.children, collapsedFolderIds, depth + 1))
    }
  }
  return rows
}

export function useContentExplorer(stagedContentTree: ComputedRef<ContentTreeNode[]>): {
  flattenedContentNodes: ComputedRef<FlattenedContentNode[]>
  isContentExplorerCollapsed: ComputedRef<boolean>
  isTreeToggleCollapsed: ComputedRef<boolean>
  isFolderCollapsed: (folderId: string) => boolean
  toggleFolder: (folderId: string) => void
  toggleAllFolders: () => void
  toggleContentExplorerCollapsed: () => void
} {
  const collapsedFolderIds = ref<Set<string>>(new Set())
  const isContentExplorerCollapsedRef = ref(false)
  const fileOnlyTreeToggleState = ref(false)

  const flattenedContentNodes = computed(() =>
    flattenContentTree(stagedContentTree.value, collapsedFolderIds.value)
  )

  const allFolderIds = computed(() => {
    const ids = new Set<string>()
    const walk = (nodes: ContentTreeNode[]): void => {
      for (const node of nodes) {
        if (node.type === 'folder') {
          ids.add(node.id)
          if (node.children && node.children.length > 0) {
            walk(node.children)
          }
        }
      }
    }
    walk(stagedContentTree.value)
    return ids
  })

  const hasAnyFolders = computed(() => allFolderIds.value.size > 0)

  watch(
    allFolderIds,
    (nextFolderIds) => {
      const nextCollapsed = new Set<string>()
      for (const id of collapsedFolderIds.value) {
        if (nextFolderIds.has(id)) {
          nextCollapsed.add(id)
        }
      }
      collapsedFolderIds.value = nextCollapsed
    },
    { immediate: true }
  )

  function isFolderCollapsed(folderId: string): boolean {
    return collapsedFolderIds.value.has(folderId)
  }

  function toggleFolder(folderId: string): void {
    const next = new Set(collapsedFolderIds.value)
    if (next.has(folderId)) {
      next.delete(folderId)
    } else {
      next.add(folderId)
    }
    collapsedFolderIds.value = next
  }

  function toggleContentExplorerCollapsed(): void {
    isContentExplorerCollapsedRef.value = !isContentExplorerCollapsedRef.value
  }

  function collapseAllFolders(): void {
    collapsedFolderIds.value = new Set(allFolderIds.value)
  }

  function expandAllFolders(): void {
    collapsedFolderIds.value = new Set()
  }

  const isAnyFolderCollapsed = computed(() => collapsedFolderIds.value.size > 0)
  const isTreeToggleCollapsed = computed(() =>
    hasAnyFolders.value ? isAnyFolderCollapsed.value : fileOnlyTreeToggleState.value
  )

  function toggleAllFolders(): void {
    if (!hasAnyFolders.value) {
      fileOnlyTreeToggleState.value = !fileOnlyTreeToggleState.value
      return
    }

    if (isAnyFolderCollapsed.value) {
      expandAllFolders()
      return
    }
    collapseAllFolders()
  }

  return {
    flattenedContentNodes,
    isContentExplorerCollapsed: computed(() => isContentExplorerCollapsedRef.value),
    isTreeToggleCollapsed,
    isFolderCollapsed,
    toggleFolder,
    toggleAllFolders,
    toggleContentExplorerCollapsed
  }
}
