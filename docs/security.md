# Security

Workshop Manager handles Steam credentials, cached authentication, optional Web API access, local filesystem paths, and process output. These boundaries must remain explicit in code and tests.

## Electron boundary

The renderer runs with:

- `nodeIntegration: false`;
- `contextIsolation: true`;
- `sandbox: true`.

Node and Electron operations are exposed through the narrow `window.workshop` preload API. New renderer capabilities should use a specific IPC channel rather than exposing generic filesystem, process, or shell access.

The main window denies new Electron windows. HTTP(S) links are handed to the system browser, and renderer navigation is restricted to the configured development origin or packaged renderer file.

## Credentials and authentication cache

- Steam passwords are not stored in `profiles.json`.
- Script-mode login temporarily places credentials in a private SteamCMD script because SteamCMD requires them for `+runscript`.
- Ephemeral scripts use exclusive creation, private permissions where supported, deterministic `finally` cleanup, and startup stale-file cleanup.
- Remembered login relies on SteamCMD’s authentication cache and can be explicitly cleared from the UI.
- OTP values are trimmed and written only to the matching active login session.

## Web API key

The optional Steam Web API key is encrypted through Electron `safeStorage` before persistence. If encryption is unavailable, the application refuses to save the key securely. An unreadable encrypted payload must be replaced through Advanced Options.

## Logs and redaction

Application metadata must never include passwords, OTP values, Web API keys, or full credential-script content. Tests explicitly check that hidden-prompt Windows OTP and password values are absent from persisted run lines.

Steam’s own output can still include usernames, Steam IDs, local paths, and published file IDs. Treat logs as potentially identifying and inspect them before sharing.

## Repository and Docker secrets

- `.env*` and `.secrets/` are ignored, except a deliberately committed `.env.example` if one is added.
- `.dockerignore` excludes `.secrets`, local agent metadata, build outputs, logs, and contract artifacts from image contexts.
- Live-test secrets are mounted read-only at runtime; they are not Docker build arguments or image layers.
- OTP input for live checks is read from stdin with terminal echo disabled.

Never commit real credentials, paste them into test cases, place them in environment variables, or include them in screenshots/log fixtures.

## Security review checklist

For changes involving IPC, processes, storage, or external input:

1. Validate identifiers, paths, URLs, and enum-like values in the main/backend layer.
2. Keep command arguments as arrays and `shell: false`.
3. Avoid logging raw inputs or generated credential scripts.
4. Ensure temporary secret-bearing files are removed on success and failure.
5. Add tests for rejection paths, cross-run isolation, redaction, and platform-specific line endings.

Related pages: [Authentication](authentication.md) and [Logging and troubleshooting](logging-and-troubleshooting.md).
