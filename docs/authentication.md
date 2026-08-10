# Authentication

Workshop Manager signs in through SteamCMD and supports password login, cached Steam sessions, email/OTP challenges, and Steam mobile-app approval.

## Sign-in modes

| Mode | Behavior |
| --- | --- |
| OTP / Email code | Starts login and accepts the code requested by Steam |
| Steam app approval | Waits for approval in Steam Mobile; if Steam requests an email code instead, the UI asks the user to switch modes |
| Saved session | Uses SteamCMD authentication cache when “Keep me signed in” is enabled |

Passwords are used for the current sign-in and are not stored in `profiles.json`. A remembered session consists of the username, preference state, and SteamCMD-owned authentication cache.

## Login lifecycle

1. The renderer submits credentials and the preferred challenge mode through the preload API.
2. The main process clears cached authentication first when strict login is requested.
3. `SteamCmdRuntimeService` starts a login run and emits a `run_started` event.
4. SteamCMD output is parsed for success, failure, OTP, and mobile-approval states.
5. The renderer submits an OTP against the active run ID or waits for mobile approval.
6. On success, the runtime resolves the Steam identity and stores only the allowed remembered state.

## Windows hidden-prompt handling

Native Windows SteamCMD can request an email code without exposing its prompt through redirected stdout/stderr. The UI therefore allows OTP submission while an OTP login run is active, even if no prompt line was detected.

The backend trims the code, verifies that the run is the active login, and writes the response using LF (`\n`). It records this safe marker without recording the code:

```text
[RUN_META] steam guard code submitted by UI before prompt detection
```

If a submission arrives before the backend run becomes active, the renderer queues it and retries when the challenge lifecycle advances.

## Clearing authentication

- Normal UI sign-out ends the application login state but can preserve a remembered SteamCMD session.
- “Clear saved session” removes remembered-auth state and invalidates SteamCMD cache files.
- Disabling “Keep me signed in” causes a strict login and clears cached authentication before the next attempt.

## Verification

```bash
pnpm test -- test/unit/frontend/composables/use-auth-flow.spec.ts
pnpm test -- test/integration/runtime-lifecycle.spec.ts
```

The opt-in real-login test is documented in [Development and testing](development-and-testing.md). Never put a password or OTP in a test fixture, command argument, environment variable, or committed file.

Related pages: [Security](security.md) and [Logging and troubleshooting](logging-and-troubleshooting.md).
