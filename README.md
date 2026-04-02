# Workshop Manager

Workshop Manager is a desktop app for creating, updating, and maintaining Steam Workshop items. It is built with Electron, Vue 3, TypeScript, and Tailwind, and wraps the SteamCMD workflow in a more guided UI for Linux and Windows users.

> [!NOTE]
> `pnpm dev`, `pnpm preview`, `pnpm test`, and `pnpm typecheck` run natively on the host.
> All `pnpm build*` and `pnpm release` packaging commands run through Docker on Linux.

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

| Use case | Requirement |
| --- | --- |
| Development | Node.js `22.x` |
| Development | `pnpm` `10.x` |
| Packaging builds | Docker on a Linux host |

> [!TIP]
> Use `pnpm dev:icon` or `pnpm preview:icon` only when you want to regenerate icon assets first.

## Getting Started

| Step | Command | Notes |
| --- | --- | --- |
| Install dependencies | `pnpm install` | Required once after cloning |
| Start development mode | `pnpm dev` | Fast local dev path |
| Start development mode with icon sync | `pnpm dev:icon` | Regenerates icon assets first |
| Run tests | `pnpm test` | Runs Vitest |
| Run type checks | `pnpm typecheck` | Checks Node, renderer, and test TS configs |
| Preview production renderer | `pnpm preview` | Local preview path |
| Preview with icon sync | `pnpm preview:icon` | Regenerates icon assets first |

## Build And Package

| Goal | Command | Output / Notes |
| --- | --- | --- |
| Build production bundle only | `pnpm build` | Writes compiled app output to `out/` |
| Build Linux package | `pnpm build:linux` | Produces Linux `.AppImage` artifacts |
| Build Linux package with icon sync | `pnpm build:linux:icon` | Regenerates icon assets first |
| Build Windows package | `pnpm build:win` | Produces Windows installer artifacts |
| Build Windows package with icon sync | `pnpm build:win:icon` | Regenerates icon assets first |
| Build Linux and Windows with icon sync | `pnpm build:all:icon` | Runs both platform packaging commands |
| Release alias | `pnpm release` | Alias for `pnpm build:all:icon` |

> [!IMPORTANT]
> Docker is build-only. The generated `.AppImage` and `.exe` run natively after packaging.
> Dockerized builds are currently supported on Linux hosts only.


> Packaging commands always rebuild the app bundle first so installers do not ship stale `out/` code.
> The wrapper performs host-side cleanup before entering Docker so stale local Electron processes do not interfere with packaging.
> Persistent Docker build caches live under `~/.cache/workshop-manager/docker-build`.
> Output artifacts are written to `dist/`.

## Windows Runtime

The Windows package is built on Linux, but it is meant to be run on Windows.

| Step | Action |
| --- | --- |
| 1 | Run `pnpm build:win` |
| 2 | Find the generated installer in `dist/` |
| 3 | Run the installer on a Windows system |
| 4 | Install and launch the app |

> [!NOTE]
> The Windows package is built on Linux, but it is intended to be installed and used on Windows.

## Changing The App Icon

Use `resources/img/app-icon.png` as the source icon.

> [!IMPORTANT]
> `resources/img/app-icon.png` is the single source of truth for the app icon used by both the app and packaged builds.

| Task | Command |
| --- | --- |
| Manually regenerate derived icon assets | `pnpm sync:icon` |
| Sync icons and launch development mode | `pnpm dev:icon` |
| Sync icons and preview the renderer | `pnpm preview:icon` |
| Regenerate icons during Linux packaging | `pnpm build:linux:icon` |
| Regenerate icons during Windows packaging | `pnpm build:win:icon` |
| Regenerate icons during both packaging flows | `pnpm build:all:icon` |
| Same combined packaging flow via alias | `pnpm release` |

## Project Layout

| Path | Purpose |
| --- | --- |
| `src/electron` | Electron main process and preload bridge |
| `src/backend` | SteamCMD services, persistence stores, and Workshop-related backend logic |
| `src/shared` | IPC contracts and shared domain types |
| `src/frontend` | Vue renderer application |
| `scripts` | Local tooling for cleanup, icon sync, packaging, and Docker build orchestration |
| `docker` | Docker image used for reproducible packaging builds |
| `test` | Unit and integration tests |

## Data And Security Notes

| Item | Behavior |
| --- | --- |
| Username/session preferences | Can be persisted when enabled |
| Passwords | Not stored as plain local config values |
| Steam Web API keys | Stored through Electron secure storage when available |
| Run logs | Stored locally so failed SteamCMD runs can be inspected later |

## Current Scope

- Linux and Windows are the primary runtime targets
- V1 intentionally excludes a Workshop stats dashboard
- V1 intentionally excludes `workshop_download_item`
