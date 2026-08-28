# Logging and troubleshooting
[< Back to Workshop Manager](../README.md) • [Documentation index](README.md)

Workshop Manager keeps dedicated SteamCMD output and installation logs so failures can be diagnosed without exposing credentials in normal metadata.

## Log locations

Both paths are beneath Electron’s `workshop-manager` application-data directory:

| File | Purpose |
| --- | --- |
| `runs/steamcmd-output.log` | Current login or Workshop run output and `[RUN_META]` diagnostics |
| `steamcmd-install.log` | SteamCMD download, extraction, discovery, and directory diagnostics |

The run-log store intentionally keeps only the current session. Starting a new run clears the previous in-memory entry and truncates `steamcmd-output.log`.

## Run metadata

Metadata lines describe lifecycle state without recording submitted secrets. Common examples include:

```text
[RUN_META] started phase=login timeoutMs=60000 ...
[RUN_META] login_challenge prompt=steam_guard_code
[RUN_META] steam guard code submitted by UI before prompt detection
[RUN_META] command finished phase=login exitCode=0
```

`[API_META]` lines describe Workshop item-loading sources and counts. They may include Steam IDs and App IDs but must not include Web API keys, passwords, or OTP values.

## Login troubleshooting

1. Confirm the log has `started phase=login` and note `mode=oneshot` or the interactive mode.
2. If email arrives but no challenge line appears on Windows, submit the code in the GUI and look for the safe “submitted by UI before prompt detection” marker.
3. If the marker is absent, the renderer/backend submission path did not accept the code.
4. If the marker exists but the run times out, native SteamCMD did not consume or accept the redirected input; retain the log for platform-specific diagnosis.
5. Increase the login timeout in Advanced Options when email delivery or manual approval takes longer than 60 seconds.

## Installation troubleshooting

Open the install log from Advanced Options and verify:

- the selected platform archive;
- download status and redirects;
- extraction command/result;
- discovered executable path;
- executable permission on Linux.

A manual path must point to an existing usable `steamcmd.sh` or `steamcmd.exe`, not merely its parent directory.

## Workshop troubleshooting

- Validation errors occur before SteamCMD and identify missing draft fields.
- Empty update content folders are rejected before execution.
- A timeout reports the run ID and log path in the UI.
- Item-list failures can come from Steam Web API, Community pages, or unresolved SteamID64. Review `[API_META]` lines to identify the source.

## Sharing logs safely

Inspect logs before sharing them. The application avoids logging submitted OTP/password values, but Steam output can contain account names, Steam IDs, local paths, published file IDs, and other identifying information. Redact those values when they are not needed for diagnosis.

Related pages: [Authentication](authentication.md), [Security](security.md), and [SteamCMD runtime](steamcmd-runtime.md).
