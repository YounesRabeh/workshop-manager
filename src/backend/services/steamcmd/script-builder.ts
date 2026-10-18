/**
 * Domain: SteamCMD script execution.
 * Overview: Produces SteamCMD script-file content for one-shot `+runscript` execution.
 * Responsibility: Generates command scripts with safe defaults and explicit controls
 * for password prompts and failure behavior during secure execution migration.
 */
import { AppError } from '@backend/utils/errors'
import { escapeInteractiveArg } from '../steam/output-parser'

interface ScriptDirectiveOptions {
  shutdownOnFailedCommand?: boolean
  noPromptForPassword?: boolean
}

interface LoginScriptOptions extends ScriptDirectiveOptions {
  username: string
  password?: string
}

interface WorkshopScriptOptions extends ScriptDirectiveOptions {
  username: string
  password?: string
  vdfPath: string
}

/** Throws a validation error when non empty value violates its required constraint. */
function assertNonEmptyValue(field: string, value: string | undefined): string {
  const normalized = value?.trim()
  if (!normalized) {
    throw new AppError('validation', `${field} is required`)
  }
  return normalized
}

/** Produces quoted SteamCMD directives from validated login and Workshop fields. */
export function buildSteamCmdScriptDirectives(options: ScriptDirectiveOptions): string[] {
  const directives: string[] = []
  if (options.shutdownOnFailedCommand !== false) {
    directives.push('@ShutdownOnFailedCommand 1')
  }
  if (options.noPromptForPassword === true) {
    directives.push('@NoPromptForPassword 1')
  }
  return directives
}

/** Builds the login script, choosing password or stored-auth instructions. */
export function buildSteamCmdLoginScript(options: LoginScriptOptions): string {
  const username = assertNonEmptyValue('username', options.username)
  const password = options.password?.trim()
  const hasPassword = Boolean(password)

  const directives = buildSteamCmdScriptDirectives({
    ...options,
    noPromptForPassword: options.noPromptForPassword ?? !hasPassword
  })

  const loginParts = ['login', escapeInteractiveArg(username)]
  if (hasPassword) {
    loginParts.push(escapeInteractiveArg(password!))
  }

  return `${[...directives, loginParts.join(' '), 'quit'].join('\n')}\n`
}

/** Builds the script that uploads, updates, or changes visibility for a Workshop item. */
export function buildSteamCmdWorkshopScript(options: WorkshopScriptOptions): string {
  const username = assertNonEmptyValue('username', options.username)
  const password = options.password?.trim()
  const vdfPath = assertNonEmptyValue('vdfPath', options.vdfPath)
  const hasPassword = Boolean(password)

  const directives = buildSteamCmdScriptDirectives({
    ...options,
    noPromptForPassword: options.noPromptForPassword ?? !hasPassword
  })

  const loginParts = ['login', escapeInteractiveArg(username)]
  if (hasPassword) {
    loginParts.push(escapeInteractiveArg(password!))
  }

  return `${[
    ...directives,
    loginParts.join(' '),
    `workshop_build_item ${escapeInteractiveArg(vdfPath)}`,
    'quit'
  ].join('\n')}\n`
}
