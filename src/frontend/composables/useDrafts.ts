/**
 * Overview: Centralizes create/update draft state and content-file workspace helpers.
 * Responsibility: Provides draft cloning/mutation utilities, tag operations, 
 * content file normalization/tree building, and staged content state per mode.
 */
import { computed, reactive, ref } from 'vue'
import type { ContentFolderFileEntry } from '@shared/contracts'
import type { ContentTreeNode, StagedContentFile, UploadDraftState } from '../types/ui'

/** Creates a new draft with all upload fields and staged-file state initialized. */
export function createEmptyDraft(): UploadDraftState {
  return {
    appId: '',
    publishedFileId: '',
    contentFolder: '',
    previewFile: '',
    title: '',
    releaseNotes: ''
  }
}

/** Creates an independent copy of draft. */
export function cloneDraft(source: UploadDraftState): UploadDraftState {
  return {
    appId: source.appId,
    publishedFileId: source.publishedFileId,
    contentFolder: source.contentFolder,
    previewFile: source.previewFile,
    title: source.title,
    releaseNotes: source.releaseNotes
  }
}

/** Copies every upload field from the source draft into the reactive target. */
export function applyDraft(target: UploadDraftState, source: UploadDraftState): void {
  target.appId = source.appId
  target.publishedFileId = source.publishedFileId
  target.contentFolder = source.contentFolder
  target.previewFile = source.previewFile
  target.title = source.title
  target.releaseNotes = source.releaseNotes
}

/** Normalizes filesystem separators and removes trailing slashes for path comparisons. */
export function normalizeFsPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Normalizes a relative content path to forward slashes without a leading slash. */
export function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

/** Removes duplicate entries from content files. */
export function dedupeContentFiles(files: StagedContentFile[]): StagedContentFile[] {
  const byPath = new Map<string, StagedContentFile>()
  for (const file of files) {
    byPath.set(normalizeFsPath(file.absolutePath), file)
  }
  return [...byPath.values()].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' })
  )
}

/** Combines content files while preserving distinct entries. */
export function mergeContentFiles(existing: StagedContentFile[], incoming: StagedContentFile[]): StagedContentFile[] {
  return dedupeContentFiles([...existing, ...incoming])
}

/** Converts a scanned file entry into the renderer's staged-file representation. */
export function toStagedContentFile(entry: ContentFolderFileEntry): StagedContentFile {
  return {
    absolutePath: entry.absolutePath,
    relativePath: normalizeRelativePath(entry.relativePath),
    sizeBytes: entry.sizeBytes,
    excluded: false
  }
}

/** Loads content folder files from its configured source. */
export async function loadContentFolderFiles(contentFolder: string): Promise<StagedContentFile[]> {
  const payload = await window.workshop.listContentFolderFiles({ folderPath: contentFolder })
  return dedupeContentFiles(payload.map(toStagedContentFile))
}

/** Groups staged files into the nested folder tree shown in the content explorer. */
export function buildContentTree(files: StagedContentFile[]): ContentTreeNode[] {
  interface MutableFileNode {
    id: string
    name: string
    type: 'file'
    relativePath: string
    absolutePath: string
    sizeBytes: number
    fileCount: number
    excluded: boolean
  }

  interface MutableFolderNode {
    id: string
    name: string
    type: 'folder'
    relativePath: string
    children: Map<string, MutableNode>
  }

  type MutableNode = MutableFolderNode | MutableFileNode

  const root: MutableFolderNode = {
    id: '__root__',
    name: '',
    type: 'folder',
    relativePath: '',
    children: new Map()
  }

  for (const file of files) {
    const parts = file.relativePath.split('/').filter((part) => part.length > 0)
    if (parts.length === 0) {
      continue
    }

    let currentFolder = root
    let currentRelativePath = ''
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      const isLeafFile = index === parts.length - 1
      currentRelativePath = currentRelativePath ? `${currentRelativePath}/${part}` : part

      if (isLeafFile) {
        currentFolder.children.set(part, {
          id: `file:${currentRelativePath}`,
          name: part,
          type: 'file',
          relativePath: currentRelativePath,
          absolutePath: file.absolutePath,
          sizeBytes: file.sizeBytes,
          fileCount: 1,
          excluded: file.excluded === true
        })
        continue
      }

      const existing = currentFolder.children.get(part)
      if (existing?.type === 'folder') {
        currentFolder = existing
        continue
      }

      const folder: MutableFolderNode = {
        id: `folder:${currentRelativePath}`,
        name: part,
        type: 'folder',
        relativePath: currentRelativePath,
        children: new Map()
      }
      currentFolder.children.set(part, folder)
      currentFolder = folder
    }
  }

  /** Records the final outcome of node and releases its active state. */
  const finalizeNode = (node: MutableNode): ContentTreeNode => {
    if (node.type === 'file') {
      return node
    }

    const children = [...node.children.values()]
      .map(finalizeNode)
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === 'folder' ? -1 : 1
        }
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      })

    return {
      id: node.id,
      name: node.name,
      type: 'folder',
      relativePath: node.relativePath,
      sizeBytes: children.reduce((sum, child) => sum + child.sizeBytes, 0),
      fileCount: children.reduce((sum, child) => sum + child.fileCount, 0),
      children
    }
  }

  const tree = finalizeNode(root)
  return tree.children ?? []
}

/** Provides create/update drafts and helpers for staged content and preview files. */
export function useDrafts() {
  const createDraft = reactive<UploadDraftState>(createEmptyDraft())
  const updateDraft = reactive<UploadDraftState>(createEmptyDraft())
  const updateDraftCache = ref<Record<string, UploadDraftState>>({})
  const isHydratingUpdateDraft = ref(false)
  const createStagedContentFiles = ref<StagedContentFile[]>([])
  const updateStagedContentFiles = ref<StagedContentFile[]>([])

  const createTotalStagedContentSizeBytes = computed(() =>
    createStagedContentFiles.value.reduce((sum, file) => sum + (file.excluded ? 0 : file.sizeBytes), 0)
  )
  const updateTotalStagedContentSizeBytes = computed(() =>
    updateStagedContentFiles.value.reduce((sum, file) => sum + (file.excluded ? 0 : file.sizeBytes), 0)
  )
  const createStagedContentTree = computed<ContentTreeNode[]>(() =>
    buildContentTree(createStagedContentFiles.value)
  )
  const updateStagedContentTree = computed<ContentTreeNode[]>(() =>
    buildContentTree(updateStagedContentFiles.value)
  )

  /** Removes the selected preview image from the create draft. */
  function clearCreatePreviewFile(): void {
    createDraft.previewFile = ''
  }

  /** Removes the selected preview image from the update draft. */
  function clearUpdatePreviewFile(): void {
    updateDraft.previewFile = ''
  }

  /** Returns the create or update draft selected by the requested mode. */
  function getDraftForMode(mode: 'create' | 'update'): UploadDraftState {
    return mode === 'create' ? createDraft : updateDraft
  }

  /** Sets one typed field on the create or update draft. */
  function setDraftField<K extends keyof UploadDraftState>(
    mode: 'create' | 'update',
    field: K,
    value: UploadDraftState[K]
  ): void {
    const draft = getDraftForMode(mode)
    draft[field] = value
  }

  /** Replaces the staged-file list for the selected publish mode. */
  function setStagedFilesForMode(mode: 'create' | 'update', files: StagedContentFile[]): void {
    if (mode === 'create') {
      createStagedContentFiles.value = files
      return
    }
    updateStagedContentFiles.value = files
  }

  /** Toggles whether the selected staged file is excluded from upload. */
  function toggleStagedFileForMode(mode: 'create' | 'update', relativePath: string): void {
    const files = mode === 'create' ? createStagedContentFiles : updateStagedContentFiles
    files.value = files.value.map((file) =>
      file.relativePath === relativePath ? { ...file, excluded: !file.excluded } : file
    )
  }

  /** Clears the selected mode's content folder and staged-file list. */
  function clearWorkspaceForMode(mode: 'create' | 'update'): void {
    const draft = getDraftForMode(mode)
    draft.contentFolder = ''
    setStagedFilesForMode(mode, [])
  }

  /** Restores drafts state to its initial state. */
  function resetDraftsState(): void {
    applyDraft(createDraft, createEmptyDraft())
    applyDraft(updateDraft, createEmptyDraft())
    updateDraftCache.value = {}
    createStagedContentFiles.value = []
    updateStagedContentFiles.value = []
  }

  return {
    createDraft,
    updateDraft,
    updateDraftCache,
    isHydratingUpdateDraft,
    createStagedContentFiles,
    updateStagedContentFiles,
    createTotalStagedContentSizeBytes,
    updateTotalStagedContentSizeBytes,
    createStagedContentTree,
    updateStagedContentTree,
    clearCreatePreviewFile,
    clearUpdatePreviewFile,
    getDraftForMode,
    setDraftField,
    setStagedFilesForMode,
    toggleStagedFileForMode,
    clearWorkspaceForMode,
    resetDraftsState
  }
}
