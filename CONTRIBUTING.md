# Contributing

## Setup

Requirements:

- Node.js 24 LTS. The version is pinned in `.node-version`; with
  [fnm](https://github.com/Schniz/fnm) run `fnm use` (or enable `--use-on-cd`).
- pnpm 12, pinned in `package.json` (`packageManager`). Update a standalone install with
  `pnpm self-update`.

```bash
pnpm install --frozen-lockfile
```

pnpm settings live in `pnpm-workspace.yaml`. pnpm refuses to resolve packages published less
than 24 hours ago (`minimumReleaseAge`); wait a day before adopting a brand-new release.

Recommended branch naming:

- `feature/<slug>`
- `fix/<slug>`
- `refactor/<slug>`
- `docs/<slug>`
- `chore/<slug>`

## Local Development

Unimian builds with esbuild and writes the Obsidian plugin artifacts to `dist/`:

- `main.js`
- `manifest.json`
- `styles.css`

For local vault copying, create `.env` from `.env.example` and set:

```bash
OBSIDIAN_VAULT_PLUGIN_PATH=/absolute/path/to/TestVault/.obsidian/plugins/unimian
```

Then run:

```bash
pnpm run dev
```

The dev build watches source files and copies the plugin artifacts to the configured vault plugin path when builds succeed.
`pnpm run deploy` builds and copies once, and fails when the path is not set.
`pnpm run build` alone never writes outside the repository.
The copy is refused unless the folder is named `unimian` and its parent `plugins` folder exists.

## Checks

Run the full local quality gate before opening a pull request:

```bash
pnpm run check
```

The gate runs TypeScript `--noEmit`, Biome (lint and format), Obsidian ESLint rules, the Markdown lint, and Vitest. Linting is read-only. To apply safe formatter/linter writes explicitly, run:

```bash
pnpm run fix
```

CI runs the full gate, which you can run locally with the same command:

```bash
pnpm run verify
```

That command runs the same lint and typecheck steps, runs the tests with coverage thresholds (`pnpm run test:coverage`), creates a production build, and verifies that `main.js`, `manifest.json`, and `styles.css` exist in `dist/`, are non-empty, and start with the license banner defined in `scripts/license-banner.mjs`. The production build also fails when it bundles an npm package version that `THIRD_PARTY_NOTICES.md` does not list.

## Tests

Tests live in `tests/` and run with Vitest (`vitest.config.mts`).

- Write the test first for new behavior and bug fixes, and see it fail before changing the code.
- Tests that need a DOM start with `// @vitest-environment happy-dom`; other tests run in Node.
- `obsidian` resolves to the test double in `tests/fixtures/obsidian.ts` (the real package ships
  types only). Add to it when code under test needs more of the Obsidian API.
- `tests/fixtures/calendar.ts` mounts the real `BasesCalendarView` with sample notes and records
  opened files, hover previews, and frontmatter writes.
- `tests/fixtures/css-merge/` holds small packages used by the `css-merge` build plugin tests.
- happy-dom has no layout engine: assert behavior and classes, and check visual layout in Obsidian
  (see the Manual QA checklist).
- Coverage thresholds in `vitest.config.mts` are a floor. Raise them when coverage grows; never
  lower them to make a change pass.

CI (`.github/workflows/ci.yml`) runs on every branch push and on pull requests to `main`: the full
gate on Linux, plus the tests on Windows. Make the `Lint, typecheck, test, build` and
`Test (Windows)` checks required in the `main` branch protection rules so failing tests block merges.

## Versioning

Set the version with `version:sync`. The release workflow requires the tag to equal
`manifest.json.version` (`1.2.3`, not `v1.2.3`).

```bash
pnpm run version:sync 1.2.3
```

The script writes the version to `package.json` and `manifest.json` and adds `versions[version] = manifest.minAppVersion` to `versions.json`. It does not commit or tag.

Review the resulting diff before tagging or pushing.

## Release

Releases are created by pushing a release tag that exactly matches `manifest.json.version`.

```bash
git push origin main
git push origin 1.2.3
```

The GitHub release workflow installs with `pnpm install --frozen-lockfile`, runs `pnpm run verify`, uploads `main.js`, `manifest.json`, and `styles.css` from `dist/` together with `LICENSE` and `THIRD_PARTY_NOTICES.md`, and attaches `unimian.zip` containing all five.

## Manual QA Checklist

- Install the release artifacts into a test vault.
- Confirm the plugin loads on desktop.
- Confirm the plugin loads on mobile if available.
- Open a Bases view using Calendar, Swimlane, and Gantt.
- Confirm view resize behavior in a narrow pane.
- Confirm light and dark themes render readable cards/bars.
- Confirm no unexpected file edits happen while opening views.
