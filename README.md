<div align="center">
  <a href="https://github.com/YounesRabeh/workshop-manager">
    <img src=".github/img/WkM.png" alt="Workshop Manager" width="640">
  </a>

  <p id="tech-stack" align="center">
    <img src="https://img.shields.io/badge/Platform-Linux%20%7C%20Windows-blue?style=for-the-badge" alt="Platform: Linux and Windows">
    <img src="https://img.shields.io/badge/Electron-35%2B-191919?style=for-the-badge&amp;logo=electron" alt="Electron 35 or later">
    <img src="https://img.shields.io/badge/Node.js-22%20%7C%2024-5FA04E?style=for-the-badge&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 22 or 24">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License">
  </p>

  <p align="center">
    <a href="#features">Features</a> •
    <a href="#screenshots">Screenshots</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#documentation">Documentation</a> •
    <a href="https://github.com/YounesRabeh/workshop-manager/releases/latest">Latest Release</a>
  </p>

  <p>
    A desktop app for creating, updating, and maintaining Steam Workshop items
    <br>
    <a href="https://github.com/YounesRabeh/workshop-manager/releases/latest"><strong>Download the latest release</strong></a>
    ·
    <a href="docs/README.md"><strong>Explore the documentation</strong></a>
  </p>
</div>

## Features

- Sign in through SteamCMD with email codes, OTP, or Steam Mobile approval.
- Create Workshop items and update their content, preview image, metadata, or visibility.
- Reuse profiles and optionally load published items through the Steam Web API.
- Inspect local run logs and manage SteamCMD without exposing Node.js to the renderer.

## Screenshots

| Publish workflow | Workshop item management |
| --- | --- |
| ![Workshop Manager publish workflow](.github/img/photo01.png) | ![Workshop Manager item management](.github/img/photo02.png) |

## Quick start

Requires [Node.js 22 or 24](https://nodejs.org/) and [pnpm 11](https://pnpm.io/).

```bash
git clone https://github.com/YounesRabeh/workshop-manager.git
cd workshop-manager
pnpm install
pnpm dev
```

| Need | Command |
| --- | --- |
| Run tests | `pnpm test` |
| Check types | `pnpm typecheck` |
| Build the app | `pnpm build` |
| Package a release | `pnpm release` |

Packaging runs in Docker and writes artifacts to `dist/`. See [build and release instructions](docs/builds-and-releases.md).

## Documentation

The [documentation hub](docs/README.md) organizes every guide by task:

| I want to… | Start here |
| --- | --- |
| Use the app | [Authentication](docs/authentication.md) · [Workshop management](docs/workshop-management.md) · [Profiles and settings](docs/profiles-and-settings.md) |
| Diagnose a problem | [Logging and troubleshooting](docs/logging-and-troubleshooting.md) · [SteamCMD runtime](docs/steamcmd-runtime.md) |
| Develop or release it | [Architecture](docs/architecture.md) · [Development and testing](docs/development-and-testing.md) · [Builds and releases](docs/builds-and-releases.md) · [Security](docs/security.md) |

## License

Distributed under the [MIT License](LICENSE).
