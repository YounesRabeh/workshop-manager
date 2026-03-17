import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const thisDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(thisDir, '..')

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function isTargetProcessForProject(command, projectRootPath) {
  const lower = command.toLowerCase()
  if (lower.includes('kill-old-instance.mjs')) {
    return false
  }

  const mentionsProject =
    lower.includes(projectRootPath.toLowerCase()) ||
    lower.includes('workshop-manager') ||
    lower.includes('steam-workshop-manager') ||
    lower.includes('steam-workshop-mod-manager')
  if (!mentionsProject) {
    return false
  }

  return (
    lower.includes('electron') ||
    lower.includes('electron-vite') ||
    lower.includes('out/main/index.js') ||
    lower.includes('workshop-manager') ||
    lower.includes('steam-workshop-manager')
  )
}

function listUnixProcesses() {
  const result = spawnSync('ps', ['-eo', 'pid=,command='], {
    encoding: 'utf8',
    shell: false
  })
  if (result.status !== 0) {
    return []
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/)
      if (!match) {
        return null
      }
      return {
        pid: Number(match[1]),
        command: match[2]
      }
    })
    .filter((entry) => entry !== null)
}

export function buildPowershellKillScript(projectRootPath) {
  const escapedRoot = projectRootPath.replace(/'/g, "''")
  return [
    `$root = '${escapedRoot}'`,
    "$targets = Get-CimInstance Win32_Process | Where-Object {",
    "  $_.CommandLine -and",
    '  $_.CommandLine -like "*$root*" -and',
    "  ($_.Name -match 'electron|workshop-manager|steam-workshop-manager|steam-workshop-mod-manager')",
    '}',
    'foreach ($proc in $targets) {',
    '  Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue',
    '}',
    'Write-Output ("Killed {0} old instance(s)." -f $targets.Count)'
  ].join('; ')
}

function isTargetProcess(command) {
  return isTargetProcessForProject(command, projectRoot)
}

function killWithPowershell() {
  const script = buildPowershellKillScript(projectRoot)

  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      encoding: 'utf8',
      shell: false
    }
  )

  if (result.status !== 0) {
    console.warn('Could not query/kill old instances with PowerShell. Continuing build.')
    return
  }

  const output = result.stdout.trim()
  if (output.length > 0) {
    console.log(output)
  }
}

async function killOnUnix() {
  const currentPid = process.pid
  const parentPid = process.ppid

  const candidates = listUnixProcesses()
    .filter((proc) => proc.pid !== currentPid && proc.pid !== parentPid)
    .filter((proc) => isTargetProcess(proc.command))

  if (candidates.length === 0) {
    console.log('No old app instances found.')
    return
  }

  for (const proc of candidates) {
    try {
      process.kill(proc.pid, 'SIGTERM')
    } catch {
      // Process may have already exited.
    }
  }

  await sleep(700)

  for (const proc of candidates) {
    if (!isAlive(proc.pid)) {
      continue
    }
    try {
      process.kill(proc.pid, 'SIGKILL')
    } catch {
      // Process may have exited between checks.
    }
  }

  console.log(`Killed ${candidates.length} old instance(s).`)
}

async function main() {
  if (process.platform === 'win32') {
    killWithPowershell()
    return
  }
  await killOnUnix()
}

function isCliEntrypoint() {
  const entry = process.argv[1]
  if (!entry) {
    return false
  }
  return pathToFileURL(resolve(entry)).href === import.meta.url
}

if (isCliEntrypoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
