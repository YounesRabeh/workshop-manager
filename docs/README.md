# Workshop Manager documentation

This directory is the technical and operational reference for Workshop Manager. Each major capability has its own page so behavior, ownership, and verification commands stay discoverable as the application evolves.

## Capability map

| Capability | Start here |
| --- | --- |
| Electron/Vue structure and IPC ownership | [Architecture](architecture.md) |
| Steam login, saved sessions, OTP, and mobile approval | [Authentication](authentication.md) |
| SteamCMD discovery, installation, scripts, and platform differences | [SteamCMD runtime](steamcmd-runtime.md) |
| Workshop create, update, visibility, and item loading | [Workshop management](workshop-management.md) |
| Saved profiles, Web API access, application data, and timeouts | [Profiles and settings](profiles-and-settings.md) |
| Run metadata, log files, failures, and diagnostic workflow | [Logging and troubleshooting](logging-and-troubleshooting.md) |
| Local setup, validation, contract tests, and Docker checks | [Development and testing](development-and-testing.md) |
| Docker packaging, release artifacts, checksums, and workflows | [Builds and releases](builds-and-releases.md) |
| Secret storage, redaction, Electron isolation, and safe test practices | [Security](security.md) |

## Other focused references

- [Docker runtime checks](../docker/README.md)
- [Build scripts](../scripts/build/README.md)
- [Runtime scripts](../scripts/runtime/README.md)
- [Maintenance scripts](../scripts/maintenance/README.md)

When behavior changes, update the relevant capability page in the same pull request. Commands documented here are expected to run from the repository root unless the page says otherwise.
