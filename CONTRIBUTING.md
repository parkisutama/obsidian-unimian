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

CI (`.github/workflows/ci.yml`) runs on pull requests and on `main`: the `Verify` job runs the full
gate on Linux, `Test (Windows)` runs the tests on Windows, and `Commit messages` checks the pull
request title and commits. All three are required by the `main` branch protection.

## Manual QA Checklist

- Install the release artifacts into a test vault.
- Confirm the plugin loads on desktop.
- Confirm the plugin loads on mobile if available.
- Open a Bases view using Calendar, Swimlane, and Gantt.
- Confirm view resize behavior in a narrow pane.
- Confirm light and dark themes render readable cards/bars.
- Confirm no unexpected file edits happen while opening views.

## Commits and pull requests

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) with these types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `revert`. A hook checks the message, and CI checks it again.
- Work on a short-lived branch and open a pull request. `main` accepts changes only through a pull request with green checks.
- Pull requests are squash-merged, so the **pull request title** becomes the commit on `main`. Write it as a Conventional Commit: `feat` and `fix` appear in the changelog and decide the next version.
- The pre-commit hook runs `pnpm run check`. Run `pnpm run verify` before pushing; CI runs the same command.
- Review comments use [Conventional Comments](https://conventionalcomments.org/) labels such as `issue`, `suggestion`, `question`, and `nitpick`.

## Releasing

Releases are automated with a human gate.

1. Every push to `main` updates one **Release PR** (`chore: release X.Y.Z`). It holds the next version in `package.json` and `manifest.json` and the new `CHANGELOG.md` section, both derived from the commits since the last release.
2. The maintainer reviews it: reword the changelog for readers, and for a minor or major release add the release record `docs/releases/X.Y.Z.md` from `docs/releases/TEMPLATE.md`. To release a different version than proposed, merge a commit whose body has the footer `Release-As: X.Y.Z`.
3. Merging the Release PR is the release decision. It creates the tag `X.Y.Z` (no `v` prefix) and the GitHub release; the workflow then runs `pnpm run verify`, attests the build, and attaches `main.js`, `manifest.json`, `styles.css`, and the plugin zip.

Before 1.0.0, a `feat` raises the patch number and a breaking change raises the minor number.

When `minAppVersion` changes, add `"X.Y.Z": "<new minAppVersion>"` to `versions.json` in the Release PR; `pnpm run verify` fails until it is there.

CI does not start by itself on the Release PR unless the repository secret `RELEASE_TOKEN` is set. Without it, push a commit to the Release PR branch or close and reopen the pull request.
