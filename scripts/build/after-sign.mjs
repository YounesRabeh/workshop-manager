/**
 * Overview: Optional post-sign release hook for production packaging.
 * Responsibility: Runs macOS notarization only when building on darwin and the
 * required Apple credentials are present in the environment.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function hasNotarizationEnvironment() {
  return (
    typeof process.env['APPLE_ID'] === 'string' &&
    process.env['APPLE_ID'].trim().length > 0 &&
    typeof process.env['APPLE_APP_SPECIFIC_PASSWORD'] === 'string' &&
    process.env['APPLE_APP_SPECIFIC_PASSWORD'].trim().length > 0 &&
    typeof process.env['APPLE_TEAM_ID'] === 'string' &&
    process.env['APPLE_TEAM_ID'].trim().length > 0
  )
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false
  })

  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? 1}.`)
  }
}

export default async function afterSign(context) {
  if (context?.electronPlatformName !== 'darwin') {
    return
  }

  if (!hasNotarizationEnvironment()) {
    console.log('[afterSign] Skipping macOS notarization: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not configured.')
    return
  }

  const productFilename = context?.packager?.appInfo?.productFilename
  const appOutDir = context?.appOutDir
  if (!productFilename || !appOutDir) {
    console.log('[afterSign] Skipping macOS notarization: electron-builder context is missing app metadata.')
    return
  }

  const appPath = join(appOutDir, `${productFilename}.app`)
  if (!existsSync(appPath)) {
    console.log(`[afterSign] Skipping macOS notarization: app bundle not found at ${appPath}.`)
    return
  }

  console.log(`[afterSign] Notarizing ${appPath}`)
  runCommand('xcrun', [
    'notarytool',
    'submit',
    appPath,
    '--apple-id',
    process.env['APPLE_ID'],
    '--password',
    process.env['APPLE_APP_SPECIFIC_PASSWORD'],
    '--team-id',
    process.env['APPLE_TEAM_ID'],
    '--wait'
  ])

  console.log(`[afterSign] Stapling ${appPath}`)
  runCommand('xcrun', ['stapler', 'staple', appPath])
}
