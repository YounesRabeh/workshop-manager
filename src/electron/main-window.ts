/**
 * Overview: Creates and configures the Electron main application window.
 * Responsibility: Resolves preload/icon assets and loads the renderer entrypoint into the BrowserWindow.
 */
import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

function resolvePreloadPath(): string {
  const jsPath = join(__dirname, '../preload/index.js')
  if (existsSync(jsPath)) {
    return jsPath
  }
  return join(__dirname, '../preload/index.mjs')
}

function resolveWindowIconPath(): string | undefined {
  const iconCandidates =
    process.platform === 'win32'
      ? ['app-icon.ico', 'app-icon.normalized.png', 'app-icon.png']
      : ['app-icon.normalized.png', 'app-icon.png', 'app-icon.icns']
  const candidateDirs = new Set<string>()
  candidateDirs.add(join(process.cwd(), 'resources', 'img'))
  candidateDirs.add(join(app.getAppPath(), 'resources', 'img'))
  candidateDirs.add(join(__dirname, '../resources', 'img'))
  candidateDirs.add(join(__dirname, '../../resources', 'img'))
  candidateDirs.add(join(process.cwd(), 'resources'))
  candidateDirs.add(join(app.getAppPath(), 'resources'))
  candidateDirs.add(join(__dirname, '../resources'))
  candidateDirs.add(join(__dirname, '../../resources'))
  const publicDir = process.env['VITE_PUBLIC']
  if (publicDir) {
    candidateDirs.add(publicDir)
  }

  for (const dir of candidateDirs) {
    for (const iconName of iconCandidates) {
      const iconPath = join(dir, iconName)
      if (existsSync(iconPath)) {
        return iconPath
      }
    }
  }

  return undefined
}

function isSafeExternalUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function resolveAllowedNavigationTarget(): URL {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    return new URL(devServerUrl)
  }

  return new URL(pathToFileURL(join(__dirname, '../renderer/index.html')).toString())
}

function isAllowedRendererNavigation(targetUrl: string): boolean {
  try {
    const allowedTarget = resolveAllowedNavigationTarget()
    const candidate = new URL(targetUrl)

    if (allowedTarget.protocol.startsWith('http')) {
      return candidate.origin === allowedTarget.origin
    }

    return candidate.protocol === 'file:' && candidate.pathname === allowedTarget.pathname
  } catch {
    return false
  }
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const iconPath = resolveWindowIconPath()
  const mainWindow = new BrowserWindow({
    width: 1050,
    height: 750,
    minWidth: 780,
    minHeight: 560,
    autoHideMenuBar: true,
    icon: iconPath,
    // Prevent white flashes during resize before renderer repaint completes.
    backgroundColor: '#171a21',
    webPreferences: {
      preload: resolvePreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  if (iconPath) {
    mainWindow.setIcon(iconPath)
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(nativeImage.createFromPath(iconPath))
    }
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }

    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedRendererNavigation(url)) {
      return
    }

    event.preventDefault()
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}
