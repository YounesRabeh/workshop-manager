# SteamCMD runtime
[< Back to Workshop Manager](../README.md) • [Documentation index](README.md)

The SteamCMD runtime owns executable discovery, installation, platform behavior, script generation, process input/output, login state, and Workshop command execution.

## Installation and discovery

`SteamCmdInstallManager` checks a validated manual path first when one is configured. Otherwise it searches the managed application-data `steamcmd/` directory. If SteamCMD is missing, it downloads the official platform archive and extracts it locally.

| Platform | Archive | Expected executable |
| --- | --- | --- |
| Linux | `steamcmd_linux.tar.gz` | `steamcmd.sh` |
| Windows | `steamcmd.zip` | `steamcmd.exe` |

Linux additionally requires the executable bit. Manual paths are validated before they are persisted.

## Execution model

The packaged application currently forces script mode while the cross-platform behavior is being validated. Login and Workshop operations use an ephemeral UTF-8 SteamCMD script passed through `+runscript`.

- Windows always selects script mode.
- Linux compatibility code still supports the persistent interactive path for tests and controlled migration checks.
- `STEAMCMD_EXECUTION_MODE=script` selects script mode outside the packaged application setup.
- Script files are created with private permissions where supported and removed in a `finally` block.
- Stale script files are purged during application startup.

Interactive OTP responses use LF on both profiles. This is intentional: redirected Windows SteamCMD input expects LF as the protocol delimiter, and a trailing carriage return can invalidate the token.

## Runtime responsibilities

| Service | Responsibility |
| --- | --- |
| `steamcmd-runtime-service.ts` | High-level login, identity, Workshop, and session orchestration |
| `steamcmd-process-session.ts` | Active process/run lifecycle and Steam Guard submission |
| `SteamCmdProcessManager.ts` | Child-process ownership and input writes |
| `SteamCmdOutputProcessor.ts` | Output buffering, prompt detection, and result derivation |
| `SteamCmdRunHandler.ts` | Run setup, timeouts, dispatch, and queueing |
| `steamcmd-script-builder.ts` | Login and Workshop script contents |
| `steamcmd-script-runner.ts` | Private temporary script creation and cleanup |
| `steam-output-parser.ts` | SteamCMD output, IDs, errors, and success parsing |

## Timeouts

| Operation | Default | Allowed range |
| --- | ---: | ---: |
| New login | 60 seconds | 5–180 seconds |
| Saved-session check | 10 seconds | 3–60 seconds |
| Workshop operation | 60 seconds | 15–600 seconds |

A value of `0` disables the corresponding timeout. Settings are normalized in `src/shared/runtime-settings.ts` before use.

## Contract verification

The command-contract test captures argv boundaries, script content/encoding, and stdin bytes without contacting Steam:

```bash
pnpm test:steamcmd:contract
pnpm container:test:steamcmd:linux
```

Native Windows behavior must be checked on a Windows Docker engine or Windows runner:

```powershell
pnpm container:test:steamcmd:windows
```

Wine is diagnostic only and is not a native Windows release gate. See [Development and testing](development-and-testing.md).
