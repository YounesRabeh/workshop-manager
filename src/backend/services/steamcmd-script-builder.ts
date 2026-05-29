/**
 * Overview: Produces SteamCMD script-file content for one-shot `+runscript` execution.
 * Responsibility: Generates command scripts with safe defaults and explicit controls
 * for password prompts and failure behavior during secure execution migration.
 */
import { AppError } from '@backend/utils/errors'
import { escapeInteractiveArg } from './steam-output-parser'

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

function assertNonEmptyValue(field: string, value: string | undefined): string {
  const normalized = value?.trim()
  if (!normalized) {
    throw new AppError('validation', `${field} is required`)
  }
  return normalized
}

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
