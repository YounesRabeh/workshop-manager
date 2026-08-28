# Builds and releases
[< Back to Workshop Manager](../README.md) • [Documentation index](README.md)

Public packaging is Docker-based so Linux AppImage and Windows portable executable builds use a consistent toolchain. Generated applications run natively; Docker is not required by end users.

## Build commands

| Command | Result |
| --- | --- |
| `pnpm build` | Production Electron bundle in `out/`, built through Docker |
| `pnpm build:linux` | Linux AppImage in `dist/` |
| `pnpm build:win` | Portable Windows executable in `dist/` |
| `pnpm build:all` | Linux and Windows artifacts |
| `pnpm checksums` | One `dist/SHA256SUMS` for existing release artifacts |
| `pnpm release` | Both packages followed by `SHA256SUMS` |
| `pnpm icon` | Derived renderer, Windows, and macOS icon assets only |

The Linux icon step does not create application-menu entries or desktop shortcuts on the build host.

## Build flow

1. `build-platform.mjs` validates the target and selects icon/checksum steps.
2. `run-build-in-docker.mjs` prepares the builder image and mounted caches.
3. `electron-vite` produces the main, preload, and renderer bundles.
4. Electron Builder creates the AppImage or portable `.exe`.
5. The checksum generator sorts release artifacts and writes one standard manifest.

Artifacts follow this pattern:

```text
Workshop Manager-<version>-linux-x86_64.AppImage
Workshop Manager-<version>-win-x64.exe
SHA256SUMS
```

## Local caches and outputs

- Build output: `out/`
- Package/release output: `dist/`
- Persistent Docker cache: `~/.cache/workshop-manager/docker-build`

All are generated; `out/` and `dist/` are ignored by Git.

## Release workflow

`.github/workflows/release.yml` runs only when a `v*` tag is pushed:

1. Call the normal CI workflow.
2. Verify `v<package.json version>` exactly matches the tag.
3. Build Linux and Windows artifacts.
4. Generate and verify `SHA256SUMS`.
5. Upload a workflow artifact.
6. Create a GitHub draft release with generated notes and all three assets.

Example release preparation:

```bash
# Update package.json first, commit it, then create the matching tag.
git tag v1.6.0
git push origin v1.6.0
```

The workflow refuses to replace an existing release for the same tag.

## Verify downloads

Linux:

```bash
sha256sum -c SHA256SUMS
```

Windows PowerShell:

```powershell
Get-FileHash ".\Workshop Manager-<version>-win-x64.exe" -Algorithm SHA256
Get-Content .\SHA256SUMS
```

See [the build-script reference](../scripts/build/README.md) for script ownership and Docker-specific notes.
