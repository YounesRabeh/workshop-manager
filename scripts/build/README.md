# Build Scripts

This folder contains packaging and release helpers used by the `pnpm build*`, `pnpm release`, and icon-sync flows.

Common entry points:

- `pnpm sync:icon`: regenerate derived app icon assets
- `pnpm build`: build the production bundle inside Docker
- `pnpm build:linux`: package the Linux AppImage
- `pnpm build:win`: package the Windows installer
- `pnpm release:checksums`: generate per-artifact `.checksum.txt` files in `dist/`
- `pnpm release`: build Linux and Windows release artifacts, then generate checksums

Notable scripts:

- `run-build-in-docker.mjs`: runs the selected build command inside the project Docker image
- `build-executable.mjs`: executes the Electron Builder packaging step
- `generate-release-checksums.mjs`: writes one SHA-256 checksum file per release artifact
- `sync-app-icon.mjs`: syncs icon assets derived from `resources/img/app-icon.png`
- `electron-builder-before-build.mjs`: pre-build hook used by Electron Builder
- `after-sign.mjs`: optional post-sign hook for notarization/signing workflows
