/**
 * Overview: publish-preview.ts module in frontend/components/publish.
 * Responsibility: Holds the primary logic/exports for this area of the app.
 */
import { computed, ref, watch, type ComputedRef } from 'vue'

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

  function onUploadPreviewError(): void {
    previewImageLoadFailedRef.value = true
    previewImageIsSquareRef.value = null
  }

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
