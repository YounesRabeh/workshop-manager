# Docker runtime checks

Run all commands in this document from the repository root. The Docker build
context excludes `.secrets`, so credentials are never copied into an image.

## Command-contract containers

These checks exercise the application's SteamCMD command construction. They do
not contact Steam and do not need an account.

```bash
pnpm container:test:steamcmd
```

`container:test:steamcmd` selects the native target for the connected Docker
engine. A Linux engine can run the Ubuntu target only:

```bash
pnpm container:test:steamcmd:linux
```

On a Windows Docker host configured for Windows containers, run:

```powershell
pnpm container:test:steamcmd:windows
```

The sanitized result is written below `artifacts/steamcmd-contract/`. The
directory is ignored by Git.

## Live Linux SteamCMD login

This is an opt-in smoke test against the real Steam service. It builds an
Ubuntu image, installs SteamCMD, and executes the application's own login
path. It requires a Linux Docker engine and an unused test account.

Create `.secrets/steam-account.key` with this exact structure, then restrict
the file to its owner:

```text
username: your-test-account
password: your-test-password
```

```bash
chmod 600 .secrets/steam-account.key
```

Request a login using the same `+runscript` mode used by the Windows profile:

```bash
pnpm container:test:steamcmd:linux:script-live
```

The test records a redacted report under
`artifacts/steamcmd-live/linux/steamcmd-live-login.json`. If Steam Guard is
required, it ends after recording that prompt; it does not leave a credentialed
container running while waiting for a code.

### Submit a Steam Guard code

After the Steam email arrives, start a fresh login attempt and supply the code
through standard input. The following Bash snippet disables terminal echo,
keeps the code out of shell history, mounts it read-only for that one run, then
deletes the temporary copy automatically:

```bash
read -rs -p 'Steam Guard code: ' steam_guard_code
printf '\n'
printf '%s\n' "$steam_guard_code" | pnpm container:test:steamcmd:linux:script-live --guard-stdin
unset steam_guard_code
```

Do not use `echo CODE | ...`, put the code in a command argument, or add it to
an environment variable: those methods can expose it through shell history,
process listings, or logs.

`--guard-stdin` intentionally does not inject a code into an already-running
container. SteamCMD's login session is short-lived, so the helper receives the
code before it starts the guarded attempt and removes its temporary file when
that attempt exits.

## Windows coverage

Native Windows command behavior requires a Windows Docker engine in Windows
containers mode. A Linux Docker engine cannot run `windows.Dockerfile`.

```powershell
pnpm container:test:steamcmd:windows
```

The Wine helper can be useful for diagnosing compatibility issues from Linux,
but it is not evidence of native Windows behavior and should not be used as the
release gate:

```bash
pnpm container:test:steamcmd:windows:wine
```

## Security boundaries

- `.secrets/` and `artifacts/` are ignored by Git.
- `.secrets/` is excluded from every Docker build context.
- The credential file and optional Steam Guard file are bind-mounted read-only;
  neither is passed as a Docker build argument, environment variable, or image
  layer.
- Live reports redact the username, password, and submitted Steam Guard code.
