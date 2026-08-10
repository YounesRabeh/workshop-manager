/**
 * Runs the SteamCMD execution contract in an OS-native Docker container.
 * A Linux engine can run only the Ubuntu target; a Windows engine can run only
 * the Windows Server Core target. This is deliberate: Wine is not equivalent
 * to Node's win32 child-process implementation.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const requestedTarget = (process.argv[2] ?? 'native').toLowerCase()
const supportedTargets = new Set(['native', 'linux', 'windows'])

if (!supportedTargets.has(requestedTarget)) {
  console.error('Usage: node scripts/runtime/run-steamcmd-contract-containers.mjs [native|linux|windows]')
  process.exit(2)
}

function runDocker(args, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: projectDir,
    stdio: 'inherit',
    shell: false,
    ...options
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function inspectDockerOsType() {
  const result = spawnSync('docker', ['info', '--format', '{{.OSType}}'], {
    cwd: projectDir,
    encoding: 'utf8',
    shell: false
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || 'Docker daemon is unavailable.'
    throw new Error(detail)
  }
  return result.stdout.trim().toLowerCase()
}

const engineOsType = inspectDockerOsType()
const nativeTarget = engineOsType === 'windows' ? 'windows' : engineOsType === 'linux' ? 'linux' : ''
const target = requestedTarget === 'native' ? nativeTarget : requestedTarget

if (!nativeTarget) {
  throw new Error(`Unsupported Docker engine OSType: ${engineOsType}`)
}
if (target !== nativeTarget) {
  throw new Error(
    `The Docker engine is ${engineOsType}; it cannot run the ${target} native container. ` +
      `Use a ${target === 'windows' ? 'Windows Docker host (Windows-containers mode)' : 'Linux Docker host'}.`
  )
}

const imageTag = `workshop-manager-steamcmd-contract-${target}:local`
const dockerfile = `docker/runtime/${target === 'linux' ? 'ubuntu' : 'windows'}.Dockerfile`
const outputDir = resolve(projectDir, 'artifacts', 'steamcmd-contract', target)
mkdirSync(outputDir, { recursive: true })

console.log(`Building ${target} SteamCMD contract image...`)
runDocker(['build', '--file', dockerfile, '--tag', imageTag, '.'])

console.log(`Running ${target} SteamCMD contract...`)
const containerOutputDir = target === 'windows' ? 'C:\\contract-output' : '/contract-output'
const runArgs = [
  'run',
  '--rm',
]
if (target === 'linux') {
  runArgs.push('--security-opt', 'label=disable')
}
runArgs.push(
  '--mount',
  `type=bind,source=${outputDir},target=${containerOutputDir}`,
  imageTag
)
runDocker(runArgs)

console.log(`Contract report: ${resolve(outputDir, 'steamcmd-command-contract.json')}`)
