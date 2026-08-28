[![Workshop Manager](.github/img/WkM.png)](https://github.com/YounesRabeh/workshop-manager)

<div align="center">

  <p align="center">
    <img src="https://img.shields.io/badge/Platform-Linux%20%7C%20Windows-blue?style=for-the-badge" alt="Platform: Linux and Windows">
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License"></a>
  </p>

  <p align="center">
    <a href="https://github.com/YounesRabeh/workshop-manager/releases/latest"><img src="https://img.shields.io/badge/Download-Latest%20Release-2EA44F?style=for-the-badge&amp;logo=github&amp;logoColor=white" alt="Download the latest release"></a>
    <a href="docs/README.md"><img src="https://img.shields.io/badge/Explore-Documentation-0969DA?style=for-the-badge&amp;logo=readthedocs&amp;logoColor=white" alt="Explore the documentation"></a>
  </p>

  <p align="center">
    <a href="#features">Features</a> •
    <a href="#screenshots">Screenshots</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#tech-stack">Tech Stack</a>
  </p>

  <p>
    A desktop app for creating, updating, and maintaining Steam Workshop items
  </p>
</div>

---

## Features

- 🔐 Sign in using your Steam account with email codes, OTP, or Steam Mobile approval.
- 🚀 Create Workshop items and update their content, preview image, metadata, or visibility.
- 🗂️ Reuse profiles and optionally load published items through the Steam Web API.
- 🛠️ Inspect local run logs and manage SteamCMD without exposing Node.js to the renderer.

## Tech stack

<p align="left"><a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-35-191919?style=for-the-badge&amp;logo=electron&amp;logoColor=white" alt="Electron 35"></a> <a href="https://vuejs.org/"><img src="https://img.shields.io/badge/Vue-3-35495E?style=for-the-badge&amp;logo=vuedotjs&amp;logoColor=4FC08D" alt="Vue 3"></a> <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&amp;logo=typescript&amp;logoColor=white" alt="TypeScript 5"></a> <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&amp;logo=tailwindcss&amp;logoColor=white" alt="Tailwind CSS 4"></a> <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22%20%7C%2024-5FA04E?style=for-the-badge&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 22 or 24"></a> <a href="https://pnpm.io/"><img src="https://img.shields.io/badge/pnpm-11-F69220?style=for-the-badge&amp;logo=pnpm&amp;logoColor=white" alt="pnpm 11"></a> <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&amp;logo=docker&amp;logoColor=white" alt="Docker"></a></p>

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

---

## License

Distributed under the [MIT License](LICENSE).
