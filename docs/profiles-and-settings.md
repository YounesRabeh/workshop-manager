# Profiles and settings

Workshop Manager keeps reusable mod profiles, remembered-login preferences, advanced settings, SteamCMD files, and current-session logs beneath Electron’s stable `workshop-manager` application-data directory.

Typical roots are `%APPDATA%\workshop-manager` on Windows and the Electron application-data location on Linux. Always use the path shown by the application or Electron rather than assuming a fixed home directory.

## Stored data

| Path relative to application data | Contents |
| --- | --- |
| `profiles.json` | Mod profiles, remembered username/options, encrypted Web API key payload, manual SteamCMD path, and timeouts |
| `steamcmd/` | Automatically managed SteamCMD installation and its cache/configuration files |
| `steamcmd-install.log` | Installation and extraction diagnostics |
| `runtime/` | Run-scoped VDF files, temporary runtime state, and private ephemeral scripts while active |
| `runs/steamcmd-output.log` | Current SteamCMD session output |

Older application-data layouts are migrated by copying only missing files into the stable directory. Existing files in the stable location are not overwritten.

## Mod profiles

A saved profile contains the fields needed to refill create/update forms:

- App ID;
- optional published file ID;
- content folder;
- optional preview image;
- title.

Profiles are frontend conveniences; backend validation still runs before every Workshop command.

## Remembered authentication

The store can remember the username, preferred Steam Guard mode, and whether cached SteamCMD authentication should be reused. It does not store the Steam password in `profiles.json`.

Clearing the saved session disables remembered authentication and removes SteamCMD authentication cache files. Normal sign-out can leave the remembered cache available for the next launch.

## Steam Web API

The Web API key is optional. When Electron secure storage is available, the encrypted base64 payload is stored in `profiles.json`; the plaintext key is not written there. If secure storage is unavailable or the payload cannot be decrypted, the application disables usable Web API access and asks for the key again.

Community-page item loading remains available without a key, subject to Steam availability and Steam ID resolution.

## Advanced settings

| Setting | Purpose |
| --- | --- |
| Web API enabled/key | Enables authenticated Workshop API queries |
| Manual SteamCMD path | Overrides the managed executable after validation |
| Login timeout | Controls password/challenge sign-in duration |
| Saved-session timeout | Controls cached-session verification duration |
| Workshop timeout | Controls create/update/visibility execution duration |

Timeout defaults and limits are listed in [SteamCMD runtime](steamcmd-runtime.md).

Focused persistence tests:

```bash
pnpm test -- test/unit/backend/stores/persistence.spec.ts
pnpm test -- test/unit/frontend/composables/use-advanced-settings.spec.ts
pnpm test -- test/unit/frontend/composables/use-stored-session-management.spec.ts
```
