/**
 * Overview: Keeps app icon assets in sync across the renderer and packaging targets.
 * Responsibility: Treats `resources/img/app-icon.png` as the single source of truth,
 *  and derives platform-specific icon formats without modifying the user's desktop.
 */
import { cp, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const thisDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(thisDir, '..', '..')

export function resolveIconAssetPaths(rootPath) {
  const iconDir = resolve(rootPath, 'resources/img')
  return {
    sourceIconPath: resolve(iconDir, 'app-icon.png'),
    normalizedIconPath: resolve(iconDir, 'app-icon.normalized.png'),
    sourceIcoPath: resolve(iconDir, 'app-icon.ico'),
    sourceIcnsPath: resolve(iconDir, 'app-icon.icns'),
    targetIconPaths: [resolve(rootPath, 'src/renderer/public/app-icon.png')],
    sourceMarkerPath: resolve(rootPath, 'resources/.icon-source')
  }
}

const {
  sourceIconPath,
  normalizedIconPath,
  sourceIcoPath,
  sourceIcnsPath,
  targetIconPaths,
  sourceMarkerPath
} = resolveIconAssetPaths(projectRoot)

async function assertReadable(path) {
  await stat(path)
}

function hasCommand(command) {
  const result = spawnSync(command, ['-version'], { stdio: 'ignore', shell: false })
  return result.status === 0
}

export function resolveImageMagickCommand(platform = process.platform) {
  if (hasCommand('magick')) {
    return 'magick'
  }
  // ImageMagick v6 commonly exposes `convert` on Linux/macOS. On Windows,
  // `convert` can resolve to a non-ImageMagick system utility.
  if (platform !== 'win32' && hasCommand('convert')) {
    return 'convert'
  }
  return undefined
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'pipe', shell: false, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `${command} failed`)
  }
}

async function generateNormalizedPng() {
  const imageMagickCommand = resolveImageMagickCommand()
  if (!imageMagickCommand) {
    return sourceIconPath
  }
  try {
    // Trim transparent borders and scale close to full canvas for better dock/taskbar legibility.
    runCommand(imageMagickCommand, [
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
  const imageMagickCommand = resolveImageMagickCommand()
  if (!imageMagickCommand) {
    console.warn('Skipping ICO generation: ImageMagick not found (expected `magick` or `convert`).')
    return
  }
  try {
    runCommand(imageMagickCommand, [
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
  const imageMagickCommand = resolveImageMagickCommand()
  if (!imageMagickCommand) {
    console.warn(
      'Skipping ICNS generation: no iconutil/sips (macOS) or ImageMagick (`magick`/`convert`).'
    )
    return
  }
  try {
    runCommand(imageMagickCommand, [inputIconPath, sourceIcnsPath])
    console.log(`Generated macOS icon: ${sourceIcnsPath}`)
  } catch (error) {
    console.warn(
      `Skipping ICNS generation: ${error instanceof Error ? error.message : String(error)}`
    )
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

  await writeFile(
    sourceMarkerPath,
    'Single source of truth: resources/img/app-icon.png\n',
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
