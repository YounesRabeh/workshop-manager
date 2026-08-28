# Development and testing
[< Back to Workshop Manager](../README.md) • [Documentation index](README.md)

## Requirements

- Node.js `22.x` or `24.x` (`.nvmrc` pins the CI version, `22.22.0`)
- pnpm `11.x` (`package.json` pins `11.21.0`)
- Docker for reproducible bundle and package builds

Install dependencies and start the app:

```bash
pnpm install
pnpm dev
```

Normal development does not regenerate icons. Use `pnpm dev:icon` only after changing `resources/img/app-icon.png`.

## Validation commands

| Command | Scope |
| --- | --- |
| `pnpm typecheck` | Node, renderer, and renderer-test TypeScript configs |
| `pnpm test` | Full Vitest suite |
| `pnpm test:watch` | Local watch mode |
| `pnpm test:steamcmd:contract` | Sanitized argv/script/stdin contract |
| `pnpm build` | Production bundle inside Docker |

Run a focused test by passing its path:

```bash
pnpm test -- test/integration/runtime-lifecycle.spec.ts
```

## Test organization

| Path | Coverage |
| --- | --- |
| `test/unit/backend` | Parsers, stores, installation, VDF, runtime helpers, and services |
| `test/unit/frontend` | Composables, components, readiness, and application behavior |
| `test/unit/scripts` | Build and runtime command orchestration |
| `test/integration/runtime-lifecycle.spec.ts` | SteamCMD process, auth, timeout, cancellation, and Workshop lifecycle |
| `test/integration/steamcmd-command-contract.spec.ts` | Native argv, generated scripts, and stdin bytes |
| `test/integration/steamcmd-live-login.spec.ts` | Opt-in real Steam login; skipped without explicit credentials |

Unit and integration tests use fake child processes and placeholder credentials. They must never contact Steam unless the test is explicitly marked as live.

## Container contract checks

On a Linux Docker engine:

```bash
pnpm container:test:steamcmd:linux
```

On a Windows Docker engine in Windows-containers mode:

```powershell
pnpm container:test:steamcmd:windows
```

Linux cannot run the Windows container. Wine is useful only for diagnosis:

```bash
pnpm container:test:steamcmd:windows:wine
```

Reports are sanitized and written beneath `artifacts/steamcmd-contract/`, which is ignored by Git.

## Credentialed live check

Live login is opt-in. Follow [the Docker runtime guide](../docker/README.md) for the exact `.secrets/steam-account.key` format and safe OTP stdin flow. Do not pass secrets as command arguments or environment variables.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and when called by the release workflow. It installs frozen dependencies under Node `22.22.0`, then runs typecheck and the full non-live test suite.

Before opening a change, run:

```bash
pnpm typecheck
pnpm test
```
