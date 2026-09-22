# Tasks: Sticky Note

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/sticky-note.md](../../docs/specs/sticky-note.md)

## Phase 0: Spike

### STICKY-001: Prove a masonry layout in the Bases scroll container

**Status:** In progress. First attempt (CSS `column-width` multi-column) failed native testing
2026-09-22 — collapsed to a single column whenever one card was much taller than the rest
(multi-column balances column *height*, not column *count*). Revised to JS-driven
shortest-column-first masonry (`masonry.ts`, design evidence from
`rknastenka/obsidian-mini-notes` — see `docs/architecture/upstream-provenance.md`); typecheck/
lint/build pass on the spike branch, awaiting the full native-testing pass below on the revised
approach.

**Description:** On a throwaway branch (`spike/sticky-note-masonry`), build a minimal Bases view
rendering real Base entries via `MarkdownRenderer`, laid out with JS-driven shortest-column-first
masonry (column count from a width breakpoint table, each card placed into the currently-shortest
column, absolutely positioned; relayout on `ResizeObserver` and per-card image `load`). Exercise
the interactions listed in plan Phase 0 in a real vault.

**Acceptance criteria:**

- [ ] `tasks/sticky-note/spike-report.md` marks each interaction works / broken / workaround.
- [ ] Explicit check for the three specific failure modes that killed Grid (see spec §6):
      missing `min-width: 0`, `aspect-ratio` cover sizing, `content-visibility` flattening.
- [ ] Explicit check that cards spread across the full pane width at every breakpoint (the
      single-column collapse found in the first CSS multi-column attempt does not recur).
- [ ] A card containing an embedded `.base` file renders without recursion/layout breakage.

**Verification:** Manual, in a real vault; the report is the deliverable. Spike code stays on
its own branch, not merged.

**Dependencies:** none.

**Likely files:** `tasks/sticky-note/spike-report.md` (spike branch only for code).

**Estimated scope:** S

## Phase 1: View skeleton and read-only rendering

### STICKY-002: Register `wise-view-sticky-note` (read-only)

**Status:** Complete (2026-09-22). Registered via `createStickyNoteViewRegistration` in
`src/views/sticky-note/index.ts`, added to `WiseViewPlugin.buildViewDescriptors()` with no
`capabilities` field at all (read-only, spec §5.3) — not `main.ts`/`viewRegistry.ts` changes
beyond the descriptor list itself.

**Acceptance criteria:**

- [x] View appears in Bases' view picker as "Sticky Note".
- [x] `tests/architecture.test.ts` passes with `src/views/sticky-note/` added to
      `GUARDED_MUTATION_DIRS` (the old `src/views/keep/` entry from the five-view program did not
      cover this directory name, so it needed adding).

**Dependencies:** STICKY-001.

**Likely files:** `src/viewRegistry.ts`, `src/main.ts`, `tests/architecture.test.ts`.

**Estimated scope:** S

### STICKY-003: Card rendering via `MarkdownRenderer`

**Status:** Complete (2026-09-22), with one deviation. `src/views/sticky-note/BasesStickyNoteView.ts`
renders each card's bounded excerpt (`content.ts`) through `MarkdownRenderer.render()`, reuses
`CoverImageResolver` for covers. Rendering logic stayed inline rather than a separate
`cardRenderer.ts` — the view is small enough (one entry type, no drag/drop, no column grouping)
that the Swimlane-style split isn't warranted yet; revisit if the file grows.

**Deviation:** does **not** reuse `EntrySnapshot`/`entrySnapshotAdapter`/`changeDetection`. Those
build path-keyed immutable snapshots for diffing across renders; this view instead reads
`entry.getValue()` directly per render and always fully re-renders on `onDataUpdated` (same as
every other property-driven view before its own change-detection pass was added). Acceptable for
v1 given STICKY-009's large-Base check is still pending; if that check finds redundant
re-rendering costly, adopting the snapshot/diffing pattern is the fix, tracked there rather than
guessed at here.

**Acceptance criteria:**

- [x] A Base with tables, an embedded `.base` file, and images renders each correctly inside a
      card.
- [~] Re-running a query updates cards — confirmed via full re-render (not diffed/incremental,
      see deviation above); native-verify no visible flicker/jank before Done.

**Dependencies:** STICKY-002.

**Likely files:** `src/views/sticky-note/BasesStickyNoteView.ts`, `src/views/sticky-note/content.ts`,
`src/views/sticky-note/masonry.ts`.

**Estimated scope:** M

## Phase 2: Color and layout options

### STICKY-004: Color via existing `ColorResolver`

**Status:** Complete (2026-09-22). `colorBy` view option, resolved through `resolveColor()`
passing the raw property value as both `explicitColor` (covers a literal hex/rgb/hsl value) and
`categoryValue` (covers a category label resolved via Pretty Properties/valueStyles/fallback) —
one property serves both cases without asking the user to pick a mode.

**Acceptance criteria:**

- [x] Card accent color matches the configured property.
- [~] Falls through Pretty Properties → valueStyles → deterministic fallback exactly like
      Swimlane — code path confirmed identical (`resolveFieldColor`'s pattern reused); native
      confirmation against a Pretty-Properties-configured Base still pending (STICKY-010).

**Dependencies:** STICKY-003.

**Likely files:** `src/views/sticky-note/options.ts`, `src/views/sticky-note/BasesStickyNoteView.ts`.

**Estimated scope:** S

### STICKY-005: Card layout options

**Status:** Complete (2026-09-22), with one deviation. Options schema in
`src/views/sticky-note/options.ts`: `titleBy`, `coverBy`, `colorBy` (property pickers),
`imageFit` (dropdown), `cardWidth`, `cardMaxHeight`, `excerptBudget` (sliders). Styling in the
view's own `src/styles/views/sticky-note.css` (not `card.css` — that file is Swimlane's; Sticky
Note's masonry-positioned cards need their own rules, not a shared one that would need per-view
branching).

**Deviation from the original plan text:** no separate desktop/tablet/mobile width sliders.
`masonry.ts`'s column count is derived from available width ÷ one `cardWidth` target (see its own
doc comment) — three fixed breakpoints would be redundant with that continuous formula, so this
simplifies three options into one without losing responsiveness. "Show tags" also dropped from
v1 per spec §5.4.4 (inline `#tags` already render as pills; a separate row would duplicate them,
not add a distinct feature).

**Acceptance criteria:**

- [x] Every option listed takes effect live from "Configure view" (options are read fresh each
      `onDataUpdated`, no caching to go stale).
- [x] `min-width: 0` applied to every card; cover images use the existing percentage technique
      (no `aspect-ratio`, no `content-visibility`).

## Phase 3: Pin persistence

### STICKY-006: Plugin-level pinned state, scoped per Base

**Status:** Not started. Blocked on STICKY-003.

**Description:** `StickyNoteData.pinnedByBase: Record<string, string[]>` persisted via
`loadData()`/`saveData()`. Pin/unpin toggle per card; pinned cards grouped above "Others".

**Acceptance criteria:**

- [ ] Pin/unpin round-trips through `saveData()`/`loadData()`.
- [ ] Pinning the same note in two different `.base` files is independent (per-Base scoping).
- [ ] Never writes to note frontmatter.

**Dependencies:** STICKY-003.

**Likely files:** `src/main.ts` (settings/data shape), `src/views/sticky-note/pinStore.ts`.

**Estimated scope:** M

### STICKY-007: Rename-safe pin migration

**Status:** Not started. Blocked on STICKY-006.

**Description:** `vault.on('rename', ...)` listener rewriting matching note paths (values) and
Base file paths (keys) in `pinnedByBase`. Lazy prune of entries whose note/Base no longer exists,
on next load.

**Acceptance criteria:**

- [ ] Renaming a pinned note keeps it pinned.
- [ ] Renaming/moving the `.base` file keeps its pinned set attached to it.
- [ ] Deleting a pinned note does not error; it is silently pruned on next load.

**Dependencies:** STICKY-006.

**Likely files:** `src/main.ts`, `src/views/sticky-note/pinStore.ts`.

**Estimated scope:** S

## Phase 4: Hardening and native acceptance

### STICKY-008: Nested `.base` embed recursion guard

**Status:** Not started. Blocked on STICKY-003.

**Description:** Regression test: a card whose note embeds the same `.base` file it is rendered
from does not infinite-loop or crash.

**Dependencies:** STICKY-003.

**Estimated scope:** S

### STICKY-009: Large-Base masonry reflow check

**Status:** Not started. Blocked on STICKY-005.

**Description:** Manual check with 50+ and 200+ entry Bases; record reflow cost. Explicitly
decide and document whether virtualization is needed now or deferred (spec §7) — do not let it
slip by silently.

**Dependencies:** STICKY-005.

**Estimated scope:** S

### STICKY-010: Native acceptance

**Status:** Not started. Blocked on all above.

**Description:** Full pass per spec §8.3 in a real vault; record in
`tasks/sticky-note/native-acceptance.md`. Update `ROADMAP.md`'s Sticky Note row to
**Done (native-accepted YYYY-MM-DD)**.

**Dependencies:** STICKY-004, STICKY-005, STICKY-007, STICKY-008, STICKY-009.

**Estimated scope:** M
