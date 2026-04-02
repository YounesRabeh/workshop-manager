# Runtime Scripts

This folder contains local runtime helpers used during development and preview flows.

Common entry points:

- `pnpm kill:instance`: stop an old local app instance before starting a new one
- `pnpm dev`: start the Electron-Vite development environment
- `pnpm preview`: launch the packaged preview flow

Notable scripts:

- `kill-old-instance.mjs`: closes stale local Electron processes that could block dev or packaging
- `run-electron-vite-command.mjs`: shared launcher wrapper for Electron-Vite runtime commands
