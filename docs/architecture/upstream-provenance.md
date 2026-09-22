# Upstream provenance ledger

Status: Active  
Specification: [Code quality, organization, and performance](../specs/code-quality-and-performance.md)

This ledger records every upstream repository assessed for Wise View's adopted-view work (the
now-retired extensible-view-platform program, and any future adoption work), the exact snapshot
inspected, its license, the reuse mode Wise View applies to it, and what is explicitly excluded.
It is the source of truth `pnpm run verify:artifacts` and `THIRD_PARTY_NOTICES.md` are reconciled
against. No task may copy source from a repository listed here beyond what its **Reuse mode** and
**Excluded** rows permit.

## Reuse mode definitions

- **Design evidence only** — no source is copied; only observed behavior/structure informs
  Wise View's own implementation. No attribution notice is required, but the row stays here
  for review traceability.
- **Behaviorally reimplemented** — Wise View writes its own code to match documented/observed
  public behavior. No attribution notice is required unless a specific fragment is adapted
  (tracked per file below).
- **Modified** — a specific upstream source file is adapted with changes; requires SPDX/
  copyright header on the resulting Wise View file and a `THIRD_PARTY_NOTICES.md` entry.
- **Copied** — used verbatim (rare, e.g. vendored CSS); requires SPDX/copyright header and a
  `THIRD_PARTY_NOTICES.md` entry.

## Adaptation depth policy (2026-09-19)

The maintainer approved full per-file source adaptation — not just design-evidence-only
reimplementation — for every remaining upstream candidate below, on the same terms already
applied to Bases Timeline: strict per-file attribution (SPDX/copyright header, a
`THIRD_PARTY_NOTICES.md` entry, and a file-level provenance row here), and continued
enforcement of each candidate's **Excluded** feature list. This changes how much of a
candidate's *source* a task may adapt; it does not expand *which features* are in scope — the
feature boundaries the specification and each row's **Excluded** list already set (status/
priority workflows, checkbox writes, network thumbnails, the image viewer, dependency
semantics, etc.) are unchanged and still enforced task by task.

This does not apply to Keep Bases View: it remains bundle-only (see its row), so there is no
readable upstream TypeScript source this policy could extend adaptation to. Keep stays a
behavioral reimplementation from public requirements; a courtesy "inspired by Keep Bases View"
mention in its own documentation is welcome but not a license requirement, since no source is
copied.

## Ledger

### Bases Timeline

- **Repository:** <https://github.com/mmattia09/obsidian-project-manager>
- **Commit:** `2c6ee7ca2ab881f5557df5a042a377b0139b8608`
- **License:** MIT
- **Reuse mode:** Full behavioral adaptation of the task-agnostic Timeline surface approved by the maintainer on 2026-09-19; implementation remains modular rather than copying the monolith.
- **Useful design evidence:** time-domain model, zoom levels, synchronized sidebar/timeline
  scroll, edge arrows, grouping, mobile list mode, pointer-anchored zoom, and quick scheduling.
- **Excluded:** hardcoded status/priority workflows, direct unguarded writes, the
  monolithic 1,316-line view structure.
- **File-level provenance:** T034A may adapt the following pinned files:
  - upstream `src/timeline-view.ts` -> Wise View `src/views/timeline/TimelineRenderer.ts` and,
    only where lifecycle wiring is necessary, `src/views/timeline/BasesTimelineView.ts`;
    permitted scope is toolbar/sidebar controls, temporal header/grid, today indicator, edge
    navigation, scroll-anchor behavior, pointer/pinch zoom, quick scheduling, and bar drag/resize
    through the configured start/end mutation capability;
  - upstream `styles.css` -> Wise View `src/styles/views/timeline.css`; permitted scope is the
    corresponding layout, ghost-bar, and presentation rules.
- **Must remain excluded:** `PRIORITY_LEVELS`, `PRIORITY_RANK`, `STATUS_ORDER`, workflow group
  sorting, group/status drops, priority editing, arbitrary property writes, and hardcoded task
  property defaults. Quick scheduling and bar drag/resize may write only configured start/end dates.
- **Attribution required:** adapted TypeScript files carry an SPDX/copyright adaptation header;
  adapted CSS carries a preserved attribution header; the upstream MIT text is included in
  `THIRD_PARTY_NOTICES.md`.

### Keep Bases View

- **Repository:** <https://github.com/k4fn/keep-bases-view>
- **Commit:** `6bf8342fe6a50dcb4b653d8346be30d54390f846`
- **License:** MIT
- **Reuse mode:** Design evidence only / behaviorally reimplemented. **Copying is not
  permitted** — see limitation below.
- **Useful design evidence:** virtual masonry requirements, offscreen measurement, bounded
  preview concurrency, stable card widths, pinned sections, scroll restore.
- **Excluded:** copying bundled `main.js`, hardcoded `keep_pinned`/`keep_color` properties,
  the popup editor, and pin/color/delete writes.
- **Bundle-only limitation:** this upstream project publishes a built `main.js`, not its
  TypeScript source. Its public requirements and observed behavior are suitable as
  behavioral input only. The bundle must never be used as a bulk source file, and any
  fragment considered for direct reuse requires explicit provenance review first because
  bundled dependency boundaries inside `main.js` are unclear.
- **File-level provenance:** none. Keep (T051-T055) is implemented from public requirements
  and observed behavior, not from `main.js` source.
- **Attribution required:** no — no source is copied.

### Mini Notes (masonry layout)

- **Repository:** <https://github.com/rknastenka/obsidian-mini-notes>
- **Commit:** `main` branch, read 2026-09-22 (not independently native at a Bases-view; a
  standalone plugin, not a Bases view — read for its masonry algorithm only).
- **License:** MIT.
- **Reuse mode:** Design evidence only. No source copied.
- **Why consulted:** the Sticky Note spike (`tasks/sticky-note/spike-report.md`, STICKY-001)
  first tried CSS `column-width` multi-column, which native testing found collapses to a single
  narrow column whenever one card is much taller than the rest — CSS multi-column balances
  column *height*, not column *count*. `src/utils/masonry.ts` in this repository documents the
  exact same failure in its own comments and fixes it with JS-driven shortest-column-first
  placement (breakpoint table → column count from container width; each card placed into
  whichever column is currently shortest; absolutely positioned so DOM order stays independent
  of visual placement).
- **Useful design evidence:** the shortest-column-first placement algorithm's shape, the
  width-breakpoint-to-column-count table concept, and absolute positioning to decouple DOM order
  from visual order (kept for keyboard/reading order and future drag-and-drop).
- **Excluded:** the file's own height-cache/`WeakMap` invalidation scheme (Sticky Note re-measures
  every relayout at spike scale; revisit only if STICKY-009's large-Base check shows it is too
  slow), its `dashboard-card`/pin-button/color-dropdown DOM and CSS, and the whole plugin's own
  UI/drag-and-drop/persistence layer — none of that is Bases-view shaped.
- **File-level provenance:** none. `src/views/sticky-note-spike/masonry.ts` (spike-only) is
  written independently from the algorithmic shape described above, not ported from the upstream
  file.
- **Attribution required:** no — no source is copied. Recorded here for review traceability per
  this ledger's own policy.

### Feed Bases

- **Repository:** <https://github.com/edrickleong/obsidian-feed-bases>
- **Commit:** `a753c21332b6ca07f7ffdf43fb2c50e013579e55`
- **License:** MIT
- **Reuse mode:** Full behavioral adaptation approved by the maintainer on 2026-09-19 (same
  terms as Bases Timeline); implementation remains modular rather than copying the file
  wholesale. A React-based file cannot be adapted as-is regardless — see Excluded — so adapting
  it still means porting its logic into Wise View's imperative-DOM approach, not copy-pasting.
- **Useful design evidence:** linear virtualization, dynamic measurement, feed presentation.
- **Excluded:** the React stack, private TanStack cache access, internal
  `new WorkspaceLeaf(app)` construction, embedded editable Markdown views.
- **File-level provenance:** none yet. A Feed task (T041-T045) records a row here, naming the
  specific upstream file(s) and resulting Wise View file(s), before adapting anything beyond
  design evidence.
- **Attribution required:** yes, once a file-level entry above is added — adapted TypeScript
  carries an SPDX/copyright adaptation header and the upstream MIT text is included in
  `THIRD_PARTY_NOTICES.md`. Reading the source for design evidence only, without adapting a
  specific file, still requires no attribution.

### Dynamic Views

- **Repository:** <https://github.com/churnish/dynamic-views>
- **Commit:** `7af74541825440bdb581023b0f795b41190c6817`
- **License:** GPL-3.0-or-later
- **Reuse mode:** Full behavioral adaptation approved by the maintainer on 2026-09-19 (same
  terms as Bases Timeline). Adaptation depth increases; the feature scope in **Excluded**
  below does not — this project still adopts only the listed core patterns, not the full
  settings/media subsystem the spec's risk table already warns is "much larger than Wise
  View."
- **Useful design evidence:** normalized `CardData`, data transform, content cache, render
  hashes, pure masonry layout, scroll anchors, popout safety, shared renderer, extensive
  tests.
- **Excluded:** wholesale import, 1.13-only API assumptions, the Sass pipeline, automatic
  `.base` cleanup, network thumbnails, the image viewer/slideshow, checkbox writes, and the
  broad settings framework.
- **File-level provenance:** none. Card Core and Grid (T035-T040) were implemented from the
  design evidence above plus Wise View's own established patterns (`EntrySnapshot`,
  `ViewRuntime`, `RenderScheduler`), not by porting a specific pinned upstream file. While
  debugging Grid's native layout failures (2026-09-19), `src/bases/grid-view.ts`,
  `styles/_grid-view.scss`, and `styles/card/_cover.scss` at the pinned commit were read
  directly to confirm two specific CSS techniques (`min-width: 0` on the grid item; a
  `height:0`/`padding-top` percentage cover instead of `aspect-ratio`) — both applied to
  `src/styles/components/card.css` as design evidence, matching an existing upstream pattern
  rather than adapting or copying either file. No file-level row is added because no file was
  adapted; per the reuse-mode definitions above, design-evidence use alone needs no attribution.
- **2026-09-19 status: Grid removed; this adoption is closed unless revived.** Even after both
  fixes above, native testing found a further CSS Grid regression (every card flattening to a
  uniform strip, traced to `content-visibility: auto` misfiring in Obsidian's Bases scroll
  container). After three rounds of native-testing failures, the maintainer removed Grid entirely
  — `src/views/grid/`, `src/core/cards/` (`CardItem`/`CardMapper`), `src/core/layouts/GridLayout.ts`,
  `src/platform/dom/GridCollection.ts` and its old `CardRenderer.ts`, and `src/styles/components/card.css`
  — rather than keep patching it blind or leave dead code in the tree. `resolveCoverImageSrc` (the
  one piece Swimlane depends on) survives, moved to `src/platform/dom/CoverImageResolver.ts`. The
  extensible-view-platform program's spec/plan/todo were also retired in favor of a code-quality
  and performance-focused spec (see `docs/specs/`). A future Grid/Masonry attempt starts fresh
  under that new spec rather than resuming this one — reconsider whether Dynamic Views' own
  grid/masonry CSS (which carries many defensive rules — iOS `contain`/`overflow-clip-margin`
  workarounds, subgrid group sections, measurement lanes — none of which this attempt ported)
  needs a more conservative, incrementally-verified adoption than the two large jumps attempted
  here, independent of the license terms below (which remain favorable and unaffected by this).
- **Attribution required:** yes, once a file-level entry above is added. Because this upstream
  project is GPL-3.0-or-later, Wise View (GPL-3.0-only) selects GPL version 3 for the
  combined distribution per specification §5.2; the upstream license and attribution must
  remain visible in any adapted file's header and in `THIRD_PARTY_NOTICES.md`. Reading the
  source for design evidence only, without adapting a specific file, still requires no
  attribution.

### Gantt Chart (`@jaeungkim/gantt-chart`)

- **Repository:** <https://github.com/jaeungkim/gantt-chart>
- **Commit:** `b8a92ff146c091bb0422c3d831dd594a8f47fc4f` (tag `v1.5.1`)
- **Package:** `@jaeungkim/gantt-chart@1.5.1`, pinned exactly in `package.json`
- **License:** MIT (inlines Day.js `1.11.23` and Zustand `5.0.15`, both MIT)
- **Reuse mode:** Copied — bundled npm dependency, unmodified. Its JavaScript runs on Preact
  through build aliases (`scripts/ui-runtime-aliases.mjs`); its stylesheet is merged into
  `styles.css` untouched and themed only through `--gantt-*` tokens in first-party CSS.
- **Adopted for:** the Gantt view ([gantt.md](../specs/gantt.md)); approved after
  the GBETA-001 spike passed Gate 1 on 2026-09-19.
- **Excluded:** no source file is copied or patched into `src/`. React itself is never installed
  or bundled (`FORBIDDEN_DEPENDENCIES`).
- **Upgrade rule:** single maintainer with a fast release cadence (six minor releases between
  2026-09-04 and 2026-09-09). Upgrade only through a dedicated task that reruns the Gantt
  write-back round-trip tests, then updates this row and `THIRD_PARTY_NOTICES.md`.
- **Known limitations (v1.5.1):** see [gantt.md §5](../specs/gantt.md) — UTC-only
  layout, exclusive end dates, global `document` listeners (popout windows), fixed bar height.
- **Attribution required:** `THIRD_PARTY_NOTICES.md` entries for the library, Day.js, and
  Zustand; `scripts/license-banner.mjs` components for the `main.js`/`styles.css` banners.

## Existing bundled dependencies (already licensed, not part of this program's new adoption)

`obsidian-bases-gantt`, FullCalendar, and Preact are already recorded in
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) from prior work and are unaffected by
this ledger; they remain reconciled by `pnpm run verify:artifacts`.

## Known upstream library limitations

Bugs in a bundled dependency that Wise View cannot fix without patching the vendored source.
Recorded here so a later task does not rediscover the same tradeoff from scratch, and so a
general fix (if one is ever found) gets applied everywhere it applies instead of once.

None currently open. The Frappe Gantt entry (a leaked `document`-level `mouseup` listener) was removed
with the library on 2026-09-20 (docs/specs/gantt-frappe-removal.md). `@jaeungkim/gantt-chart`'s own
limitations are recorded in its ledger entry above and in docs/specs/gantt.md §5.

## How an implementation task records file-level provenance

When a task copies or modifies an upstream file (rather than only reading it for design
evidence):

1. Add a row under the relevant candidate's **File-level provenance** above naming the
   upstream file path, the resulting Wise View file path, and the commit it was taken from.
2. Add an SPDX license identifier and copyright header to the top of the resulting Wise View
   file.
3. Add or extend the corresponding entry in `THIRD_PARTY_NOTICES.md` with the full required
   notice text.
4. Add the component to `scripts/verify-build-artifacts.mjs` license verification coverage.
5. Keep a test that captures the adopted behavior so the provenance claim stays checkable.

A task that only used a repository as design evidence (no copied/modified file) does not need
steps 2-4, but should still confirm its ledger row's **Reuse mode** and **Excluded** notes are
accurate for what was actually built.
