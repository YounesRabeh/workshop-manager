# Workshop management

[Documentation index](README.md) · [Project README](../README.md)

Workshop Manager supports creating Workshop items, updating existing items, changing visibility, previewing local content, and loading the signed-in user’s published items.

## Create an item

A create draft requires:

- numeric Steam App ID;
- non-empty content folder;
- non-empty title.

Preview image and visibility are optional. The backend validates the draft again, writes a run-scoped VDF file, and calls `workshop_build_item` through SteamCMD. A successful create extracts and returns the new published file ID.

## Update an item

An update requires App ID, published file ID, and title. It must also provide content, a preview image, or both. When a content folder is supplied, the backend scans it and rejects an empty folder before SteamCMD starts.

The update path is classified as:

- `content`;
- `preview`;
- `content_and_preview`;
- `none` when no uploadable change is selected.

Change notes preserve newlines in the generated VDF. Other values escape backslashes, quotes, and embedded line breaks before execution.

## Visibility

| Value | UI label | Steam behavior |
| ---: | --- | --- |
| `0` | Public | Visible publicly and discoverable |
| `1` | Friends-only | Limited to the owner, friends, and administrators |
| `2` | Hidden | Limited to the owner, administrators, and creators |
| `3` | Unlisted | Public by link but omitted from searches/profile listings |

A visibility-only operation generates a minimal VDF containing the App ID, published file ID, and visibility.

## Content explorer and local previews

The renderer requests directory selection through Electron’s native dialog, then asks the backend to recursively list files. Paths and file sizes are returned to the renderer; Node filesystem access is not exposed directly.

On Windows, a native folder picker may not display files while navigating. The in-app Content Explorer displays them after the folder is selected.

## Loading published items

After Steam ID resolution, item discovery can use two sources in parallel:

- Steam Web API when a usable encrypted key is enabled;
- Steam Community pages as the normal fallback/source.

Results are normalized and merged by published file ID. Public item details are fetched in batches of up to 100 IDs. An optional App ID filters the result.

## Main implementation files

- `src/shared/workshop-requirements.ts`
- `src/backend/utils/validation.ts`
- `src/backend/services/workshop-command-service.ts`
- `src/backend/services/vdf-generator.ts`
- `src/backend/services/workshop-fetch-service.ts`
- `src/frontend/components/publish/`

Run the focused tests with:

```bash
pnpm test -- test/unit/backend/services/vdf-generator.spec.ts
pnpm test -- test/unit/backend/services/workshop-command-service.spec.ts
pnpm test -- test/unit/frontend/composables/use-publish-orchestration.spec.ts
```
