# Workshop Manager documentation
[< Back to Workshop Manager](../README.md)

Use this hub to find the shortest path to the information you need. Commands are run from the repository root unless a guide says otherwise.

## Start here

| Your goal | Reading path |
| --- | --- |
| Publish or maintain a Workshop item | [Authentication](authentication.md) → [Workshop management](workshop-management.md) |
| Configure saved profiles or Steam access | [Profiles and settings](profiles-and-settings.md) → [Security](security.md) |
| Fix login, installation, or publishing failures | [Logging and troubleshooting](logging-and-troubleshooting.md) → [SteamCMD runtime](steamcmd-runtime.md) |
| Understand or change the code | [Architecture](architecture.md) → [Development and testing](development-and-testing.md) |
| Build a distributable release | [Builds and releases](builds-and-releases.md) → [Security](security.md) |

## Using Workshop Manager

| Guide | Covers |
| --- | --- |
| [Authentication](authentication.md) | Password login, Steam Guard, mobile approval, saved sessions, and sign-out |
| [Workshop management](workshop-management.md) | Creating, updating, visibility, content previews, and published-item discovery |
| [Profiles and settings](profiles-and-settings.md) | Saved profiles, application data, Web API access, paths, and timeouts |
| [Logging and troubleshooting](logging-and-troubleshooting.md) | Log locations, safe diagnostics, and common failure workflows |

## Developing Workshop Manager

| Guide | Covers |
| --- | --- |
| [Architecture](architecture.md) | Electron boundaries, runtime flow, code ownership, and adding capabilities |
| [SteamCMD runtime](steamcmd-runtime.md) | Installation, execution modes, process ownership, scripts, and timeouts |
| [Development and testing](development-and-testing.md) | Local setup, validation commands, test layout, containers, and CI |
| [Security](security.md) | IPC isolation, credentials, temporary files, storage, logs, and review checks |

## Shipping releases

[Builds and releases](builds-and-releases.md) documents Docker packaging, output files, checksums, version tags, and download verification.

## Quick answers

| Question | Answer |
| --- | --- |
| Where are profiles and logs stored? | [Application data and stored files](profiles-and-settings.md#stored-data) |
| How do I clear a remembered login? | [Clearing authentication](authentication.md#clearing-authentication) |
| Why is Steam Guard waiting or timing out? | [Login troubleshooting](logging-and-troubleshooting.md#login-troubleshooting) |
| Which command validates a change? | [Validation commands](development-and-testing.md#validation-commands) |
| How do I verify a downloaded build? | [Verify downloads](builds-and-releases.md#verify-downloads) |

## Focused references

- [Docker runtime and live checks](../docker/README.md)
- [Build scripts](../scripts/build/README.md)
- [Runtime scripts](../scripts/runtime/README.md)
- [Maintenance scripts](../scripts/maintenance/README.md)

When behavior changes, update its guide in the same pull request. Never place credentials, OTP values, Web API keys, or unredacted private logs in documentation or examples.
