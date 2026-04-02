# Maintenance Scripts

This folder contains cleanup helpers for generated local artifacts.

Common entry points:

- `pnpm clean`: remove generated build outputs and TypeScript incremental cache files

Notable scripts:

- `clean.mjs`: clears `dist/`, `out/`, and local `tsconfig*.tsbuildinfo` files
