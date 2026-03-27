/**
 * Overview: Keeps app icon assets in sync across the renderer, packaging targets,
 *  and Linux launcher integrations.
 * Responsibility: Treats `resources/app-icon.png` as the single source of truth,
 *  derives platform-specific icon formats, and refreshes desktop launcher metadata.
 */
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const thisDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(thisDir, '..')
const sourceIconPath = resolve(projectRoot, 'resources/app-icon.png')
const normalizedIconPath = resolve(projectRoot, 'resources/app-icon.normalized.png')
const sourceIcoPath = resolve(projectRoot, 'resources/app-icon.ico')
const sourceIcnsPath = resolve(projectRoot, 'resources/app-icon.icns')
const targetIconPaths = [
  resolve(projectRoot, 'src/renderer/public/app-icon.png'),
  resolve(projectRoot, 'src/frontend/public/app-icon.png')
]

async function assertReadable(path) {
  await stat(path)
}

function hasCommand(command) {
  const result = spawnSync(command, ['-version'], { stdio: 'ignore', shell: false })
  return result.status === 0
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'pipe', shell: false, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `${command} failed`)
  }
}

export function escapeSingleQuotesForBash(value) {
  return value.replace(/'/g, "'\"'\"'")
}

/**
 * Produces a Linux desktop entry that launches the project from source with the
 * correct icon and WM class metadata.
 */
export function buildLinuxLauncherContent({ displayName, projectRootPath, appId, iconAbsolutePath }) {
  const escapedRoot = escapeSingleQuotesForBash(projectRootPath)
  return `[Desktop Entry]
Type=Application
Version=1.0
Name=${displayName}
Comment=Steam Workshop upload and update tool
GenericName=Workshop Mod Manager
Terminal=false
Categories=Utility;Development;
Keywords=workshop;steam;mod;mods;upload;update;publisher;manager;
StartupNotify=true
StartupWMClass=${appId}
Icon=${iconAbsolutePath}
Exec=/bin/bash -lc "cd '${escapedRoot}' && env CHROME_DESKTOP=${appId}.desktop -u ELECTRON_RUN_AS_NODE pnpm dev"
`
}

/**
 * Updates only the launcher fields this project owns while preserving the rest
 * of an existing `.desktop` file.
 */
export function rewriteDesktopEntryMappings(original, { displayName, appId, iconAbsolutePath }) {
  const withName = /^Name=.*$/m.test(original)
    ? original.replace(/^Name=.*$/m, `Name=${displayName}`)
    : `${original.trimEnd()}\nName=${displayName}\n`
  const withIcon = /^Icon=.*$/m.test(withName)
    ? withName.replace(/^Icon=.*$/m, `Icon=${iconAbsolutePath}`)
    : `${withName.trimEnd()}\nIcon=${iconAbsolutePath}\n`
  const withWmClass = /^StartupWMClass=.*$/m.test(withIcon)
    ? withIcon.replace(/^StartupWMClass=.*$/m, `StartupWMClass=${appId}`)
    : `${withIcon.trimEnd()}\nStartupWMClass=${appId}\n`
  return withWmClass
}

async function generateNormalizedPng() {
  if (!hasCommand('magick')) {
    return sourceIconPath
  }
  try {
    // Trim transparent borders and scale close to full canvas for better dock/taskbar legibility.
    runCommand('magick', [
      sourceIconPath,
      '-trim',
      '+repage',
      '-resize',
      '512x512',
      '-gravity',
      'center',
      '-background',
      'none',
      '-extent',
      '512x512',
      normalizedIconPath
    ])
    console.log(`Generated normalized icon: ${normalizedIconPath}`)
    return normalizedIconPath
  } catch (error) {
    console.warn(
      `Skipping normalized PNG generation: ${error instanceof Error ? error.message : String(error)}`
    )
    return sourceIconPath
  }
}

async function generateIco(inputIconPath) {
  if (!hasCommand('magick')) {
    console.warn('Skipping ICO generation: ImageMagick (magick) not found.')
    return
  }
  try {
    runCommand('magick', [
      inputIconPath,
      '-define',
      'icon:auto-resize=256,128,64,48,32,16',
      sourceIcoPath
    ])
    console.log(`Generated Windows icon: ${sourceIcoPath}`)
  } catch (error) {
    console.warn(`Skipping ICO generation: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function generateIcnsWithIconutil(inputIconPath) {
  const iconsetDir = await mkdtemp(resolve(tmpdir(), 'steam-workshop-iconset-'))
  try {
    const iconsetPath = resolve(iconsetDir, 'app.iconset')
    await mkdir(iconsetPath, { recursive: true })
    const sizes = [16, 32, 128, 256, 512]
    for (const size of sizes) {
      runCommand('sips', [
        '-z',
        String(size),
        String(size),
        inputIconPath,
        '--out',
        resolve(iconsetPath, `icon_${size}x${size}.png`)
      ])
      const retina = size * 2
      runCommand('sips', [
        '-z',
        String(retina),
        String(retina),
        inputIconPath,
        '--out',
        resolve(iconsetPath, `icon_${size}x${size}@2x.png`)
      ])
    }
    runCommand('iconutil', ['-c', 'icns', iconsetPath, '-o', sourceIcnsPath])
    console.log(`Generated macOS icon: ${sourceIcnsPath}`)
  } finally {
    await rm(iconsetDir, { recursive: true, force: true })
  }
}

async function generateIcns(inputIconPath) {
  if (process.platform === 'darwin' && hasCommand('iconutil') && hasCommand('sips')) {
    await generateIcnsWithIconutil(inputIconPath)
    return
  }
  if (!hasCommand('magick')) {
    console.warn('Skipping ICNS generation: no iconutil/sips (macOS) or ImageMagick (magick).')
    return
  }
  try {
    runCommand('magick', [inputIconPath, sourceIcnsPath])
    console.log(`Generated macOS icon: ${sourceIcnsPath}`)
  } catch (error) {
    console.warn(
      `Skipping ICNS generation: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

async function syncLinuxDesktopIcon(inputIconPath) {
  if (process.platform !== 'linux') {
    return
  }

  const homeDir = process.env['HOME']
  if (!homeDir) {
    return
  }

  try {
    const appId = 'workshop-manager'
    const displayName = 'Workshop Manager'
    const iconSizes = [512, 256, 128, 64, 48, 32]
    const iconName = `${appId}.png`

    for (const size of iconSizes) {
      const outDir = resolve(homeDir, `.local/share/icons/hicolor/${size}x${size}/apps`)
      const outPath = resolve(outDir, iconName)
      try {
        await mkdir(outDir, { recursive: true })
        if (hasCommand('magick')) {
          try {
            runCommand('magick', [inputIconPath, '-resize', `${size}x${size}`, outPath])
          } catch {
            await cp(inputIconPath, outPath, { force: true, errorOnExist: false })
          }
        } else {
          await cp(inputIconPath, outPath, { force: true, errorOnExist: false })
        }
      } catch {
        // Best effort only.
      }
    }
    console.log(`Synced Linux icon theme entries for ${appId}`)

    const iconAbsolutePath = resolve(homeDir, `.local/share/icons/hicolor/512x512/apps/${iconName}`)
    const launcherContent = buildLinuxLauncherContent({
      displayName,
      projectRootPath: projectRoot,
      appId,
      iconAbsolutePath
    })

    const canonicalDesktopFiles = [
      resolve(homeDir, '.local/share/applications/workshop-manager.desktop'),
      resolve(homeDir, 'Desktop/Workshop-Manager.desktop')
    ]

    for (const desktopPath of canonicalDesktopFiles) {
      try {
        await mkdir(dirname(desktopPath), { recursive: true })
        await writeFile(desktopPath, launcherContent, 'utf8')
        await chmod(desktopPath, 0o755)
        console.log(`Wrote canonical launcher: ${desktopPath}`)
      } catch {
        // Best effort only.
      }
    }

    const legacyDesktopFiles = [
      resolve(homeDir, '.local/share/applications/steam-workshop-manager.desktop'),
      resolve(homeDir, 'Desktop/Steam-Workshop-Manager.desktop')
    ]

    const desktopFiles = [
      resolve(homeDir, '.local/share/applications/steam-workshop-manager.desktop'),
      resolve(homeDir, 'Desktop/Steam-Workshop-Manager.desktop'),
      resolve(homeDir, '.local/share/applications/workshop-manager.desktop'),
      resolve(homeDir, 'Desktop/Workshop-Manager.desktop')
    ]

    for (const desktopPath of desktopFiles) {
      try {
        await stat(desktopPath)
        const original = await readFile(desktopPath, 'utf8')
        const rewritten = rewriteDesktopEntryMappings(original, {
          displayName,
          appId,
          iconAbsolutePath
        })
        await writeFile(desktopPath, rewritten, 'utf8')
        console.log(`Updated launcher icon mapping: ${desktopPath}`)
      } catch {
        // Ignore if launcher file does not exist.
      }
    }

    for (const desktopPath of legacyDesktopFiles) {
      try {
        await rm(desktopPath, { force: true })
        console.log(`Removed legacy launcher: ${desktopPath}`)
      } catch {
        // Best effort only.
      }
    }

    if (hasCommand('gtk-update-icon-cache')) {
      try {
        runCommand('gtk-update-icon-cache', ['-f', '-t', resolve(homeDir, '.local/share/icons/hicolor')])
      } catch {
        // Best effort only.
      }
    }
  } catch {
    // Best effort only.
  }
}

/**
 * Main sync routine used by `pnpm sync:icon`.
 */
async function syncIcon() {
  await assertReadable(sourceIconPath)
  const effectiveIconPath = await generateNormalizedPng()

  for (const targetPath of targetIconPaths) {
    await mkdir(dirname(targetPath), { recursive: true })
    await cp(effectiveIconPath, targetPath, {
      force: true,
      errorOnExist: false,
      mode: constants.COPYFILE_FICLONE
    })
    console.log(`Synced app icon: ${targetPath}`)
  }

  await generateIco(effectiveIconPath)
  await generateIcns(effectiveIconPath)
  await syncLinuxDesktopIcon(effectiveIconPath)

  await writeFile(
    resolve(projectRoot, 'resources/.icon-source'),
    'Single source of truth: resources/app-icon.png\n',
    'utf8'
  )
}

function isCliEntrypoint() {
  const entry = process.argv[1]
  if (!entry) {
    return false
  }
  return pathToFileURL(resolve(entry)).href === import.meta.url
}

if (isCliEntrypoint()) {
  syncIcon().catch((error) => {
    console.error(`Failed to sync app icon from ${sourceIconPath}`)
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
