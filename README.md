# Version Compare

VS Code extension for comparing two folders with filename matching that ignores trailing version/date tokens while preserving type prefixes by default.

## Commands

- `Version Compare: Open Compare View`
- `Version Compare: Select Left Folder`
- `Version Compare: Select Right Folder`
- `Version Compare: Compare`
- `Version Compare: Refresh`
- `Version Compare: Change Settings and Re-compare`

Use `Version Compare: Open Compare View` to open the full compare UI in an editor tab. The tab lets you select Left/Right folders, run compare, filter result groups, and inspect left/right paths in a side-by-side table.

Results also appear in the Explorer `Version Compare` TreeView. Paired items open VS Code's built-in diff viewer. Ambiguous items can be manually paired with `Pick Match...`.

## Core behavior

- Requires the same extension to pair files.
- Removes trailing `YYYYMMDD` date tokens from the core match key.
- Removes configured version tokens near the filename tail, for example `1.0P2` and `V1.2`.
- Keeps leading type prefixes like `G-RPT` in the key by default, so `G-RPT_*` does not match `G-DF_*` unless `versionCompare.matching.includeTypePrefix` is disabled.
- Defaults to matching only inside the same relative folder.

## Development

```sh
npm install
npm run compile
npm test
```
