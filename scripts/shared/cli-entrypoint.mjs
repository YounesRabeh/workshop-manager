import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function isCliEntrypoint(moduleUrl, entry = process.argv[1]) {
  return Boolean(entry) && pathToFileURL(resolve(entry)).href === moduleUrl
}
