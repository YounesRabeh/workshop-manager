/**
 * Overview: Preview-image helpers for publish draft media selection.
 * Responsibility: Normalizes local file URLs and provides reactive preview loading, error, and square-aspect detection state.
 */
import { computed, ref, watch, type ComputedRef } from 'vue'

/** Converts a local filesystem path into a URL that the renderer can load. */
export function toLocalFileUrl(path: string): string {
  if (!path) {
    return ''
  }
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('file://') ||
    path.startsWith('data:')
  ) {
    return path
  }

  const normalizedPath = path.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalizedPath)) {
    return `file:///${encodeURI(normalizedPath)}`
  }
  if (normalizedPath.startsWith('/')) {
    return `file://${encodeURI(normalizedPath)}`
  }
  return ''
}

/** Validates and exposes the selected local image preview to the publish form. */
export function useUploadPreview(previewFileValue: ComputedRef<string>): {
  uploadPreviewImageSrc: ComputedRef<string>
  previewImageLoadFailed: ComputedRef<boolean>
  previewImageIsSquare: ComputedRef<boolean | null>
  onUploadPreviewError: () => void
  onUploadPreviewLoad: (event: Event) => void
} {
  const previewImageLoadFailedRef = ref(false)
  const previewImageIsSquareRef = ref<boolean | null>(null)
  const uploadPreviewImageSrcRef = ref('')
  let previewLoadRequestId = 0

  watch(
    previewFileValue,
    async (path) => {
      previewLoadRequestId += 1
      const requestId = previewLoadRequestId

      previewImageLoadFailedRef.value = false
      previewImageIsSquareRef.value = null
      uploadPreviewImageSrcRef.value = ''

      if (!path) {
        return
      }

      const fallbackFileUrl = toLocalFileUrl(path)
      const previewLoader = window.workshop.getLocalImagePreview
      if (typeof previewLoader !== 'function') {
        uploadPreviewImageSrcRef.value = fallbackFileUrl
        return
      }

      try {
        const nextImage = await previewLoader({ path })
        if (requestId !== previewLoadRequestId) {
          return
        }
        uploadPreviewImageSrcRef.value = nextImage || fallbackFileUrl
        previewImageLoadFailedRef.value = false
      } catch {
        if (requestId !== previewLoadRequestId) {
          return
        }
        uploadPreviewImageSrcRef.value = fallbackFileUrl
      }
    },
    { immediate: true }
  )

  /** Marks the selected preview as unreadable so the form can show its fallback. */
  function onUploadPreviewError(): void {
    previewImageLoadFailedRef.value = true
    previewImageIsSquareRef.value = null
  }

  /** Records whether the loaded thumbnail has a square aspect ratio. */
  function onUploadPreviewLoad(event: Event): void {
    const image = event.target as HTMLImageElement | null
    if (!image) {
      previewImageIsSquareRef.value = null
      return
    }

    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!width || !height) {
      previewImageIsSquareRef.value = null
      return
    }

    previewImageIsSquareRef.value = Math.abs(width - height) <= 1
  }

  return {
    uploadPreviewImageSrc: computed(() => uploadPreviewImageSrcRef.value),
    previewImageLoadFailed: computed(() => previewImageLoadFailedRef.value),
    previewImageIsSquare: computed(() => previewImageIsSquareRef.value),
    onUploadPreviewError,
    onUploadPreviewLoad
  }
}
