# Implementation plan: Sticky Note

Status: Draft — Phase 0 (layout spike) in progress; layout technique revised 2026-09-22 (CSS
multi-column → JS-driven masonry) after first native test
Specification: [../../docs/specs/sticky-note.md](../../docs/specs/sticky-note.md)
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Baseline: branch `main` (see spec's Baseline branch note — `dev` is missing `QuickPreviewModal`)

## Overview

Sticky Note is a new read-only view in `src/views/sticky-note/`. Its riskiest unknown — a masonry
layout that actually reflows correctly inside Obsidian's Bases scroll container — is proven
first, on a throwaway branch, before any of the persistence/options work, because Grid failed
exactly this kind of layout three times before being removed (spec §0, §6, §7). Order after that:
view skeleton, read-only card rendering, color, pin persistence, layout options, hardening,
native acceptance.

## Phase 0: Spike — masonry layout in the Bases scroll container (gate)

- Throwaway branch (`spike/sticky-note-masonry`): minimal Bases view rendering real Base entries
  via `MarkdownRenderer`.
- **First attempt (2026-09-22): CSS `column-width`/`column-gap`, `break-inside: avoid`, no
  `content-visibility`.** Native test in a real vault found CSS multi-column balances column
  *height*, not column *count* — a single tall card collapsed the whole grid to one narrow
  column, leaving most of the pane's width empty instead of spreading cards across it. Not one
  of Grid's original three failure modes, but the same class of problem (a CSS layout technique
  behaving differently inside Bases' real container than expected).
- **Revised approach: JS-driven shortest-column-first masonry** (`masonry.ts`) — column count
  from a width breakpoint table, each card placed into the currently-shortest column,
  absolutely positioned. Design evidence: `rknastenka/obsidian-mini-notes` (MIT, design evidence
  only — `docs/architecture/upstream-provenance.md`'s "Mini Notes (masonry layout)" entry),
  whose own source documents this exact CSS multi-column failure and fixes it the same way.
  Relayout triggered on `ResizeObserver` (container width change) and per-card image `load`
  events.
- Check in a real vault: initial render, pane resize (desktop/tablet/mobile width), scroll
  performance, light/dark theme, a card containing an embedded `.base` file, async image load
  reflow.
- Record findings in `tasks/sticky-note/spike-report.md` (works / broken / workaround per
  interaction), same format as `tasks/gantt/spike-report.md`.

### Checkpoint 0 (Gate 1)

- Spike report written; no regression found equivalent to Grid's three (missing `min-width: 0`,
  `aspect-ratio` cover, `content-visibility` flattening) or the multi-column single-column
  collapse found and fixed above.
- Maintainer decides: proceed with JS-driven masonry, or stop and reconsider layout technique
  before any further work.

## Phase 1: View skeleton and read-only rendering

- Descriptor `wise-view-sticky-note` in `src/viewRegistry.ts`: no `capabilities.mutations`, no
  `legacyMutation` (spec §5.3).
- `src/views/sticky-note/BasesStickyNoteView.ts` (slim, per the Swimlane-split precedent) plus
  `cardRenderer.ts` using `MarkdownRenderer.render()` against each entry's note content.
- Reuse `EntrySnapshot`/`entrySnapshotAdapter`/`changeDetection` for entry diffing, and
  `CoverImageResolver` for cover images.

### Checkpoint A

- `pnpm run check`, `pnpm run build`, `pnpm run verify:artifacts` pass.
- Sticky Note appears in Bases' view picker; a Base with mixed content (tables, embedded
  `.base`, images) renders correctly, unstyled-but-correct card grid, no pin/color yet.

## Phase 2: Color and layout options

- `colorProperty` view option wired into the existing `resolveColor()` (spec §5.2) — no new
  color logic.
- Options schema (`src/views/sticky-note/options.ts`): card title property, cover image
  property, image fit, card width (desktop/tablet/mobile), show tags, card preview max height.
- Styling: `src/styles/components/card.css` extended (not duplicated) for the JS-driven masonry
  layout proven in Phase 0, `min-width: 0` baseline, existing cover percentage technique reused.
  The masonry placement module itself (promoted from the spike) lives alongside the view, e.g.
  `src/views/sticky-note/masonry.ts`.

### Checkpoint B

- All §2.5 options take effect live from "Configure view" without reopening the Base.
- Color reflects the configured property via existing resolver, confirmed against a Base that
  also uses Pretty Properties.

## Phase 3: Pin persistence

- `StickyNoteData` in plugin `data.json` (spec §5.1): `pinnedByBase: Record<string, string[]>`.
- Pin/unpin toggle per card; pinned cards render in a "Pinned" group above "Others".
- `vault.on('rename')` listener migrating both note-path and Base-file-path keys.
- Lazy prune of stale entries (deleted note/Base) on load.

### Checkpoint C

- Unit tests: add/remove pin, rename migration (note renamed, Base file renamed), stale-entry
  prune, scoping (same note pinned in one Base but not another).
- Native check: pin survives Obsidian restart; renaming the pinned note in the file explorer
  keeps it pinned.

## Phase 4: Hardening and native acceptance

- Nested `.base` embed recursion guard (spec §7) — explicit test with a card embedding the same
  Base file it is rendered from.
- Large-Base check (50+, 200+ entries) for masonry reflow cost (spec §7); record findings, defer
  virtualization explicitly if not needed yet rather than silently shipping without a note.
- Full native-acceptance pass per spec §8.3; record in `tasks/sticky-note/native-acceptance.md`
  (pattern: `tasks/gantt/native-acceptance.md`).
- `ROADMAP.md` Sticky Note row updated to **Done (native-accepted YYYY-MM-DD)**.

## Explicitly deferred (not this plan)

- Delete/trash affordance on the card (spec §5.3) — needs its own
  `docs/architecture/view-write-access.md` decision record first.
- Virtualization for very large Bases beyond what Phase 4's check finds acceptable.
- Mobile-tuned UX (per `ROADMAP.md`'s Follow-ups: deliberately deferred across all views, not
  specific to Sticky Note).
