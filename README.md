# Workshop Manager

Workshop Manager is a desktop app for creating, updating, and maintaining Steam Workshop items. It is built with Electron, Vue 3, TypeScript, and Tailwind, and wraps the SteamCMD workflow in a more guided UI for Linux and Windows users.

## Screenshots

| Screenshot 1 | Screenshot 2 |
| --- | --- |
| ![Workshop Manager Screenshot 1](github/photo01.png) | ![Workshop Manager Screenshot 2](github/photo02.png) |

## What It Does

- Signs in to Steam, including Steam Guard flows
- Installs or detects SteamCMD automatically, with a manual fallback path
- Creates new Workshop items
- Updates existing Workshop items
- Changes Workshop item visibility
- Persists profiles, settings, and run logs locally
- Keeps the Electron boundary locked down with `nodeIntegration: false`, `contextIsolation: true`, and a preload bridge

## Requirements

### For development

- Node.js 22.x
- `pnpm` 10.x

### For packaging builds

- Docker on a Linux host

`pnpm dev`, `pnpm preview`, `pnpm test`, and `pnpm typecheck` run natively on the host.

All `pnpm build*` commands in this repo run through Docker on Linux.

## Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the app in development mode:

   ```bash
   pnpm dev
   ```

3. Run tests:

   ```bash
   pnpm test
   ```

4. Run type checks:

   ```bash
   pnpm typecheck
   ```

5. Preview the production renderer locally:

   ```bash
   pnpm preview
   ```

## Build And Package

### Build the app bundle

Build the production Electron/Vite output without creating an installer:

```bash
pnpm build
```

This command runs inside Docker on Linux hosts and writes the compiled app output to `out/`.

### Build a Linux AppImage

```bash
pnpm build:appImage
```

To regenerate icons first:

```bash
pnpm build:appImage:icon
```

### Build a Windows installer from Linux

```bash
pnpm build:win
```

To regenerate icons first:

```bash
pnpm build:win:icon
```

### Build behavior notes

- Docker is build-only. The generated `.AppImage` and `.exe` run natively after packaging.
- Host Wine is not required for the supported Windows packaging flow.
- Dockerized builds are currently supported on Linux hosts only.
- Packaging commands always rebuild the app bundle first so installers do not ship stale `out/` code.
- The wrapper performs host-side cleanup before entering Docker so stale local Electron processes do not interfere with packaging.
- Persistent Docker build caches live under `~/.cache/workshop-manager/docker-build`.
- Output artifacts are written to `dist/`.
- Avoid using raw `pnpm exec electron-builder ...` as the normal workflow unless you intentionally rebuilt the bundle yourself first.

## Windows Runtime

The Windows package is built on Linux, but it is meant to be run on Windows.

Typical flow:

1. Run `pnpm build:win`
2. Find the generated installer in `dist/`
3. Copy it to a Windows machine or VM
4. Install and run it there

## Changing The App Icon

Use `resources/img/app-icon.png` as the source icon.

- This file is the single source of truth for the app icon used by both the app and packaged builds.
- Run `pnpm sync:icon` after replacing it so the generated icon assets stay in sync.
- If you want packaging icons regenerated during packaging, use `pnpm build:appImage:icon` or `pnpm build:win:icon`.

## Project Layout

- `src/electron`: Electron main process and preload bridge
- `src/backend`: SteamCMD services, persistence stores, and Workshop-related backend logic
- `src/shared`: IPC contracts and shared domain types
- `src/frontend`: Vue renderer application
- `scripts`: local tooling for cleanup, icon sync, packaging, and Docker build orchestration
- `docker`: Docker image used for reproducible packaging builds
- `test`: unit and integration tests

## Data And Security Notes

- Username/session preferences can be persisted when enabled
- Passwords are not stored as plain local config values
- Steam Web API keys are stored through Electron secure storage when available
- Run logs are stored locally so failed SteamCMD runs can be inspected later

## Current Scope

- Linux and Windows are the primary runtime targets
- V1 intentionally excludes a Workshop stats dashboard
- V1 intentionally excludes `workshop_download_item`
