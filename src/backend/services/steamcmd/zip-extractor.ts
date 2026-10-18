import { createWriteStream } from 'node:fs'
import { mkdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { open, type Entry, type ZipFile } from 'yauzl'

const MAX_EXTRACTED_BYTES = 512 * 1024 * 1024
const MAX_ZIP_ENTRIES = 4096

// The caller supplies a new private staging directory; never merge into an existing installation.
/** Extracts regular files only, rejecting unsafe paths, duplicate names, and archives over the resource limits. */
export async function extractSteamCmdZip(archivePath: string, stagingDir: string): Promise<void> {
  const root = await realpath(stagingDir)
  const zip = await new Promise<ZipFile>((resolveZip, reject) => {
    open(archivePath, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true },
      (error, file) => error ? reject(error) : resolveZip(file))
  })
  const paths = new Set<string>()
  let declaredBytes = 0
  let extractedBytes = 0
  let entryCount = 0

  /** Returns whether a destination path is a strict descendant of the extraction root. */
  function contained(path: string): boolean {
    const part = relative(root, path)
    return part !== '' && !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`)
  }

/** Writes a ZIP file entry only after validating its type and destination path. */
  async function extractEntry(entry: Entry): Promise<void> {
    if (++entryCount > MAX_ZIP_ENTRIES) throw new Error('ZIP entry limit exceeded')
    const type = (entry.externalFileAttributes >>> 16) & 0o170000
    if (type !== 0 && type !== 0o100000 && type !== 0o040000) {
      throw new Error('Unsupported ZIP entry type (symlinks and special files are forbidden)')
    }
    const directory = entry.fileName.endsWith('/') || type === 0o040000
    const name = entry.fileName.replace(/\/$/, '')
    const parts = name.split('/')
    // Apply Windows rules on every host, including Linux tests and Wine builds.
    if (parts.some(part => !part || part === '.' || part === '..' ||
      /[<>:"\\|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) {
      throw new Error('Unsafe ZIP entry path')
    }
    const destination = resolve(root, ...parts)
    if (!contained(destination)) throw new Error('ZIP entry escapes extraction directory')
    const key = name.toLowerCase()
    if (paths.has(key)) throw new Error('Duplicate ZIP entry path')
    paths.add(key)
    declaredBytes += entry.uncompressedSize
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 ||
      declaredBytes > MAX_EXTRACTED_BYTES) throw new Error('ZIP extracted size limit exceeded')
    await mkdir(directory ? destination : dirname(destination), { recursive: true })
    const parent = await realpath(directory ? destination : dirname(destination))
    if (parent !== root && !contained(parent)) throw new Error('ZIP output escapes extraction directory')
    if (directory) return
    const input = await new Promise<NodeJS.ReadableStream>((resolveStream, reject) => {
      zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolveStream(stream))
    })
    await pipeline(input, new Transform({
      /** Converts operation to the representation expected by the caller. */
      transform(chunk: Buffer, _encoding, callback) {
        extractedBytes += chunk.length
        callback(extractedBytes > MAX_EXTRACTED_BYTES ? new Error('ZIP extracted size limit exceeded') : null, chunk)
      }
    }), createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
  }

  try {
    if (zip.entryCount > MAX_ZIP_ENTRIES) throw new Error('ZIP entry limit exceeded')
    await new Promise<void>((resolveZip, reject) => {
      zip.once('error', reject)
      zip.once('end', resolveZip)
      zip.on('entry', (entry: Entry) => {
        void extractEntry(entry).then(() => zip.readEntry(), reject)
      })
      zip.readEntry()
    })
  } finally {
    zip.close()
  }
}
