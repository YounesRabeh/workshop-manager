/**
 * Overview: useDrafts.ts module in frontend/composables.
 * Responsibility: Holds the primary logic/exports for this area of the app.
 */
import { computed, reactive, ref } from 'vue'
import type { ContentFolderFileEntry } from '@shared/contracts'
import type { ContentTreeNode, StagedContentFile, UploadDraftState } from '../types/ui'

export function createEmptyDraft(): UploadDraftState {
  return {
    appId: '',
    publishedFileId: '',
    contentFolder: '',
    previewFile: '',
    title: '',
    releaseNotes: '',
    tags: []
  }
}

export function cloneDraft(source: UploadDraftState): UploadDraftState {
  return {
    appId: source.appId,
    publishedFileId: source.publishedFileId,
    contentFolder: source.contentFolder,
    previewFile: source.previewFile,
    title: source.title,
    releaseNotes: source.releaseNotes,
    tags: [...source.tags]
  }
}

export function applyDraft(target: UploadDraftState, source: UploadDraftState): void {
  target.appId = source.appId
  target.publishedFileId = source.publishedFileId
  target.contentFolder = source.contentFolder
  target.previewFile = source.previewFile
  target.title = source.title
  target.releaseNotes = source.releaseNotes
  target.tags = [...source.tags]
}

export function normalizeFsPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

export function dedupeContentFiles(files: StagedContentFile[]): StagedContentFile[] {
  const byPath = new Map<string, StagedContentFile>()
  for (const file of files) {
    byPath.set(normalizeFsPath(file.absolutePath), file)
  }
  return [...byPath.values()].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' })
  )
}

export function mergeContentFiles(existing: StagedContentFile[], incoming: StagedContentFile[]): StagedContentFile[] {
  return dedupeContentFiles([...existing, ...incoming])
}

export function isPathInContentFolder(filePath: string, contentFolder: string): boolean {
  const normalizedFile = normalizeFsPath(filePath)
  const normalizedFolder = normalizeFsPath(contentFolder)
  if (!normalizedFolder) {
    return false
  }
  return normalizedFile === normalizedFolder || normalizedFile.startsWith(`${normalizedFolder}/`)
}

export function toStagedContentFile(entry: ContentFolderFileEntry): StagedContentFile {
  return {
    absolutePath: entry.absolutePath,
    relativePath: normalizeRelativePath(entry.relativePath),
    sizeBytes: entry.sizeBytes
  }
}

export async function loadContentFolderFiles(contentFolder: string): Promise<StagedContentFile[]> {
  const payload = await window.workshop.listContentFolderFiles({ folderPath: contentFolder })
  return dedupeContentFiles(payload.map(toStagedContentFile))
}

export function buildContentTree(files: StagedContentFile[]): ContentTreeNode[] {
  interface MutableFileNode {
    id: string
    name: string
    type: 'file'
    relativePath: string
    absolutePath: string
    sizeBytes: number
    fileCount: number
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
          fileCount: 1
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

export function useDrafts() {
  const createDraft = reactive<UploadDraftState>(createEmptyDraft())
  const updateDraft = reactive<UploadDraftState>(createEmptyDraft())
  const updateDraftCache = ref<Record<string, UploadDraftState>>({})
  const isHydratingUpdateDraft = ref(false)
  const updateTagsTouched = ref(false)
  const createTagInput = ref('')
  const updateTagInput = ref('')
  const createStagedContentFiles = ref<StagedContentFile[]>([])
  const updateStagedContentFiles = ref<StagedContentFile[]>([])

  const createTotalStagedContentSizeBytes = computed(() =>
    createStagedContentFiles.value.reduce((sum, file) => sum + file.sizeBytes, 0)
  )
  const updateTotalStagedContentSizeBytes = computed(() =>
    updateStagedContentFiles.value.reduce((sum, file) => sum + file.sizeBytes, 0)
  )
  const createStagedContentTree = computed<ContentTreeNode[]>(() =>
    buildContentTree(createStagedContentFiles.value)
  )
  const updateStagedContentTree = computed<ContentTreeNode[]>(() =>
    buildContentTree(updateStagedContentFiles.value)
  )

  function addCreateTag(): void {
    const normalizedTags = createTagInput.value
      .split(/[;,]/g)
      .map((tag) => tag.trim())
      .filter(Boolean)

    if (normalizedTags.length === 0) {
      return
    }

    const existing = new Set(createDraft.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))
    for (const tag of normalizedTags) {
      const dedupeKey = tag.toLowerCase()
      if (existing.has(dedupeKey)) {
        continue
      }
      createDraft.tags.push(tag)
      existing.add(dedupeKey)
    }
    createTagInput.value = ''
  }

  function addUpdateTag(): void {
    const normalizedTags = updateTagInput.value
      .split(/[;,]/g)
      .map((tag) => tag.trim())
      .filter(Boolean)

    if (normalizedTags.length === 0) {
      return
    }

    const existing = new Set(updateDraft.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))
    let addedCount = 0
    for (const tag of normalizedTags) {
      const dedupeKey = tag.toLowerCase()
      if (existing.has(dedupeKey)) {
        continue
      }
      updateDraft.tags.push(tag)
      existing.add(dedupeKey)
      addedCount += 1
    }

    if (addedCount > 0) {
      updateTagsTouched.value = true
    }
    updateTagInput.value = ''
  }

  function removeCreateTag(tag: string): void {
    createDraft.tags = createDraft.tags.filter((value) => value !== tag)
  }

  function removeUpdateTag(tag: string): void {
    const before = updateDraft.tags.length
    updateDraft.tags = updateDraft.tags.filter((value) => value !== tag)
    if (updateDraft.tags.length < before) {
      updateTagsTouched.value = true
    }
  }

  function onChangeCreateTagInput(value: string): void {
    createTagInput.value = value
  }

  function onChangeUpdateTagInput(value: string): void {
    updateTagInput.value = value
  }

  function clearCreatePreviewFile(): void {
    createDraft.previewFile = ''
  }

  function clearUpdatePreviewFile(): void {
    updateDraft.previewFile = ''
  }

  function getDraftForMode(mode: 'create' | 'update'): UploadDraftState {
    return mode === 'create' ? createDraft : updateDraft
  }

  function getStagedFilesForMode(mode: 'create' | 'update'): StagedContentFile[] {
    return mode === 'create' ? createStagedContentFiles.value : updateStagedContentFiles.value
  }

  function setStagedFilesForMode(mode: 'create' | 'update', files: StagedContentFile[]): void {
    if (mode === 'create') {
      createStagedContentFiles.value = files
      return
    }
    updateStagedContentFiles.value = files
  }

  function clearWorkspaceForMode(mode: 'create' | 'update'): void {
    const draft = getDraftForMode(mode)
    draft.contentFolder = ''
    setStagedFilesForMode(mode, [])
  }

  return {
    createDraft,
    updateDraft,
    updateDraftCache,
    isHydratingUpdateDraft,
    updateTagsTouched,
    createTagInput,
    updateTagInput,
    createStagedContentFiles,
    updateStagedContentFiles,
    createTotalStagedContentSizeBytes,
    updateTotalStagedContentSizeBytes,
    createStagedContentTree,
    updateStagedContentTree,
    addCreateTag,
    addUpdateTag,
    removeCreateTag,
    removeUpdateTag,
    onChangeCreateTagInput,
    onChangeUpdateTagInput,
    clearCreatePreviewFile,
    clearUpdatePreviewFile,
    getDraftForMode,
    getStagedFilesForMode,
    setStagedFilesForMode,
    clearWorkspaceForMode
  }
}
