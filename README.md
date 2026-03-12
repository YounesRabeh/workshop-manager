# Steam Workshop Manager (V1)

Desktop app built with Electron + Vite + Vue 3 + TypeScript + Tailwind for Steam Workshop publish/update workflows.

## Included in V1

- SteamCMD install manager with auto-download attempt and manual fallback path support.
- Steam login with Steam Guard event detection and code submission flow.
- Upload new item and update existing item through generated VDF files.
- JSON-backed local profile persistence.
- Timestamped per-run log persistence with live stream and replay.
- Secure Electron boundary: `nodeIntegration: false`, `contextIsolation: true`, strict preload API.

## Project Layout

- `src/electron`: main process and preload bridge.
- `src/backend`: SteamCMD services, VDF generation, persistence stores.
- `src/shared`: domain and IPC contract types.
- `src/frontend`: Vue renderer UI.
- `test`: unit + integration tests.

## Run From Source

1. Install dependencies:
   - `npx -y pnpm@10 install`
2. Start development app:
   - `npx -y pnpm@10 dev`
3. Run tests:
   - `npx -y pnpm@10 test`
4. Type-check:
   - `npx -y pnpm@10 typecheck`

## Notes

- Username persistence is supported when selected; password is kept in memory only.
- V1 intentionally excludes Workshop stats dashboard and `workshop_download_item`.
- Linux and Windows are the target runtime platforms.
- Workshop listing limitation and future plan: `src/backend/services/steamcmd-workshop-listing-notes.md`.
