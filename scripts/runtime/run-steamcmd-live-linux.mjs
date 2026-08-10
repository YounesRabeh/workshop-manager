/**
 * Runs the real Linux SteamCMD login smoke test without placing credentials in
 * Docker arguments, environment variables, stdout, or the built image.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const secretPath = resolve(projectDir, '.secrets', 'steam-account.key')
const windowsWine = process.argv.includes('--windows-wine')
const forceScriptMode = process.argv.includes('--script-mode')
const targetName = windowsWine ? 'windows-wine' : 'linux'
const outputDir = resolve(projectDir, 'artifacts', 'steamcmd-live', targetName)
const imageTag = `workshop-manager-steamcmd-live-${targetName}:local`
const dockerfile = windowsWine
  ? 'docker/runtime/windows-wine.Dockerfile'
  : 'docker/runtime/ubuntu.Dockerfile'
const readGuardCodeFromStdin = process.argv.includes('--guard-stdin')
let guardSecretDir
let guardSecretPath

if (readGuardCodeFromStdin) {
  const guardCode = readFileSync(0, 'utf8').trim().toUpperCase()
  if (!/^[A-Z0-9]{5}$/.test(guardCode)) {
    throw new Error('Steam Guard code must contain exactly five letters or digits.')
  }
  guardSecretDir = mkdtempSync(join(tmpdir(), 'workshop-manager-steam-guard-'))
  guardSecretPath = join(guardSecretDir, 'code')
  writeFileSync(guardSecretPath, `${guardCode}\n`, { encoding: 'utf8', mode: 0o600 })
  process.once('exit', () => {
    rmSync(guardSecretDir, { recursive: true, force: true })
  })
}

function runDocker(args) {
  const result = spawnSync('docker', args, {
    cwd: projectDir,
    stdio: 'inherit',
    shell: false
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const secretStat = statSync(secretPath)
if (!secretStat.isFile()) {
  throw new Error(`Steam credential secret is not a file: ${secretPath}`)
}
if ((secretStat.mode & 0o077) !== 0) {
  throw new Error('Steam credential secret must not be readable or writable by group/other (expected mode 0600).')
}

const info = spawnSync('docker', ['info', '--format', '{{.OSType}}'], {
  cwd: projectDir,
  encoding: 'utf8',
  shell: false
})
if (info.error || info.status !== 0) {
  throw info.error ?? new Error(info.stderr?.trim() || 'Docker daemon is unavailable.')
}
if (info.stdout.trim().toLowerCase() !== 'linux') {
  throw new Error('The credentialed Linux SteamCMD test requires a Linux Docker engine.')
}

mkdirSync(outputDir, { recursive: true })

console.log(`Building credential-free ${targetName} SteamCMD test image...`)
runDocker(['build', '--file', dockerfile, '--tag', imageTag, '.'])

console.log(`Running real ${targetName} SteamCMD login smoke test (credential values are not printed)...`)
const dockerRunArgs = [
  'run',
  '--rm',
  '--security-opt',
  'label=disable',
  '--env',
  'STEAMCMD_LIVE_TEST=1',
  '--env',
  'STEAMCMD_LIVE_SECRET_FILE=/run/secrets/steam-account',
  '--env',
  'STEAMCMD_LIVE_OUTPUT_DIR=/live-output',
  '--env',
  `STEAMCMD_LIVE_PROFILE=${windowsWine ? 'windows' : 'linux'}`,
  '--mount',
  `type=bind,source=${secretPath},target=/run/secrets/steam-account,readonly`,
  '--mount',
  `type=bind,source=${outputDir},target=/live-output`,
]
if (forceScriptMode) {
  dockerRunArgs.push('--env', 'STEAMCMD_EXECUTION_MODE=script')
}
if (guardSecretPath) {
  dockerRunArgs.push(
    '--env',
    'STEAMCMD_LIVE_GUARD_FILE=/run/secrets/steam-guard-code',
    '--mount',
    `type=bind,source=${guardSecretPath},target=/run/secrets/steam-guard-code,readonly`
  )
}
dockerRunArgs.push(
  imageTag,
  'pnpm',
  'run',
  'test:steamcmd:live'
)
runDocker(dockerRunArgs)

console.log(`Sanitized live report: ${resolve(outputDir, 'steamcmd-live-login.json')}`)
