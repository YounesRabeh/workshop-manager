# Workshop Manager

Cross-platform desktop app for Steam Workshop publish/update workflows, built with Electron, Vue 3, TypeScript, and Tailwind.

## Screenshots

| Screenshot 1 | Screenshot 2 |
| --- | --- |
| ![Workshop Manager Screenshot 1](github/photo01.png) | ![Workshop Manager Screenshot 2](github/photo02.png) |

## Included in V1

- SteamCMD install manager with auto-download and manual fallback path support.
- Steam login with Steam Guard handling.
- Upload new items and update existing items through generated VDF files.
- Local JSON-backed persistence for app/profile data.
- Per-run SteamCMD log persistence.
- Secure Electron boundary (`nodeIntegration: false`, `contextIsolation: true`, preload bridge only).

## Project Layout

- `src/electron`: main process and preload bridge.
- `src/backend`: SteamCMD services, VDF generation, persistence stores.
- `src/shared`: domain and IPC contract types.
- `src/frontend`: Vue renderer UI.
- `test`: unit + integration tests.

## Run From Source

1. Install dependencies:
   - `pnpm install`
2. Start development app:
   - `pnpm dev`
3. Run tests:
   - `pnpm test`
4. Type-check:
   - `pnpm typecheck`
5. Build bundles only (no installer):
   - `pnpm build`
6. Build platform executable package:
   - `pnpm build:exe`
   - By default, this skips icon regeneration.
   - To regenerate icon assets before packaging, run `pnpm build:exe:icon` (or `pnpm build:exe -- --generate-icon`).
   - Output artifacts are written to `dist/`
   - Host platform targets:
     - Windows: `*.exe` (NSIS)
     - macOS: `*.dmg`
     - Linux: `*.AppImage`

## Notes

- Username persistence is supported when selected; password is kept in memory only.
- V1 intentionally excludes Workshop stats dashboard and `workshop_download_item`.
- Linux and Windows are the target runtime platforms.
