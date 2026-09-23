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

**Deviation (resolved 2026-09-22, see STICKY-011):** does **not** reuse `EntrySnapshot`/
`entrySnapshotAdapter` for per-entry data modeling — this view instead reads `entry.getValue()`
directly per render. It *does* now reuse `changeDetection.ts`'s `computeRenderSignature` and
`RenderScheduler` (the same skip-if-identical mechanism Calendar's PERF-002 uses), added after
native testing showed Bases calls `onDataUpdated()` far more often than the query result
actually changes — see STICKY-011.

**Acceptance criteria:**

- [x] A Base with tables, an embedded `.base` file, and images renders each correctly inside a
      card.
- [x] Re-running a query updates cards — an identical entries/config signature now skips the
      rebuild entirely (`RenderScheduler`), confirmed fixing the visible flicker STICKY-011
      reported.

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

## Phase 4 item logged early: card reposition jank during interaction

### STICKY-011: Cards visibly shift position during hover/click interaction

**Status:** Complete (2026-09-23). Root cause confirmed by temporary `console.log` instrumentation
in a native test: **cause (2)** from the original hypothesis list — Bases calls
`onDataUpdated()` far more often than the query result actually changes (observed firing
repeatedly, several times in a few seconds, with a stack trace bottoming out in Obsidian's own
`notifyView`/app.js, unrelated to any resize). Every one of those calls tore down and rebuilt
every card's DOM from scratch (`gridEl.empty()` + full re-render), which read as cards visibly
reorganizing. Causes (1) and (3) were ruled out: the container/card `ResizeObserver`s never
fired during the reproduction — logged and confirmed silent.

**Fix:** wired `RenderScheduler`/`computeRenderSignature` (`changeDetection.ts`) into
`onDataUpdated()` — the same skip-if-identical mechanism Calendar's PERF-002 already uses. An
`onDataUpdated()` call whose entries (path+mtime) and relevant options are identical to the last
render is now a no-op instead of a full rebuild. This is also exactly the STICKY-003 deviation
flagged earlier ("if redundant re-rendering is costly, adopting the snapshot/diffing pattern is
the fix") — turned out to be needed for UX correctness, not just performance.

**Acceptance criteria:**

- [x] Root cause identified via temporary logging (`console.log`, not `console.debug` — the
      latter is hidden by DevTools' default "Verbose" filter, cost one extra round-trip
      confirming "the console shows nothing" was a filter setting, not evidence of no firing).
- [x] Fix applied without removing the `transition: top/left` CSS (unrelated to the actual cause,
      kept for genuine reflows e.g. resize/pin toggle).
- [ ] Native-verify: hovering and clicking cards produces no visible reposition of unrelated
      cards (pending the maintainer's confirmation on the rebuilt version).

**Dependencies:** none.

**Likely files:** `src/views/sticky-note/BasesStickyNoteView.ts`.

**Estimated scope:** S

## Phase 3: Pin persistence

### STICKY-006: Plugin-level pinned state, scoped per Base

**Status:** Complete (2026-09-22), with one API-driven design change. `StickyNoteData.pinnedByBase`
lives in `WiseViewSettings.stickyNote`, persisted via the existing `loadData()`/`saveData()`.
Pin/unpin toggle button per card (visible on hover/focus, always visible when pinned); pinned
cards render in their own "Pinned" masonry section above "Others" (hidden entirely when nothing
is pinned).

**Design change: no public API exposes which `.base` file a `BasesView` instance belongs to.**
Checked `BasesView`/`QueryController`/`BasesViewConfig`/`BasesViewFactory` in `obsidian.d.ts` —
none carry a file path. Rather than reach for an undocumented internal property (against this
project's own established convention — see `backlinks.ts`'s explicit choice of the public
`resolvedLinks` map over the undocumented `getBacklinksForFile`), `src/views/sticky-note/
ownerBaseFile.ts` walks `Workspace.iterateAllLeaves()` (public) to find the leaf whose `view`
is a `FileView` (public) containing this view's `containerEl`, and reads its public `.file`.
Accepted limitation: an *embedded* Base (`![[Foo.base]]` inside another note) resolves to the
embedding note's path, not `Foo.base`'s — still a stable, real scope, just one level up from
ideal in that one case.

**Acceptance criteria:**

- [x] Pin/unpin round-trips through `saveData()`/`loadData()`.
- [x] Pinning the same note in two different `.base` files is independent (per-Base scoping) —
      covered by `tests/sticky-note-pin-store.test.ts`.
- [x] Never writes to note frontmatter.

**Dependencies:** STICKY-003.

**Likely files:** `src/types/settings.ts`, `src/views/sticky-note/pinStore.ts`,
`src/views/sticky-note/ownerBaseFile.ts`, `src/views/sticky-note/BasesStickyNoteView.ts`.

**Estimated scope:** M

### STICKY-007: Rename-safe pin migration

**Status:** Complete (2026-09-22). `WiseViewPlugin.onload()` registers a `vault.on('rename', ...)`
listener calling `migratePath()`, and prunes stale entries once via `pruneMissing()` before that
(both pure functions in `pinStore.ts`, unit-tested). `migratePath`/`pruneMissing` return the same
object reference when nothing changed, so a `saveSettings()` write only happens when the mapping
actually changed.

**Acceptance criteria:**

- [x] Renaming a pinned note keeps it pinned — `migratePath` rewrites the value side.
- [x] Renaming/moving the `.base` file keeps its pinned set attached to it — `migratePath`
      rewrites the key side.
- [x] Deleting a pinned note does not error; it is silently pruned on next load —
      `pruneMissing`, called once at `onload()`.

**Dependencies:** STICKY-006.

**Likely files:** `src/main.ts`, `src/views/sticky-note/pinStore.ts`.

**Estimated scope:** S

## Phase 4: Hardening and native acceptance

### STICKY-008: Nested `.base` embed recursion guard

**Status:** Complete (2026-09-23), narrower than originally scoped. The concrete risk found in
native testing (a Base's own query listing the Base file itself as an entry — seen in earlier
screenshots) is guarded: `renderCard()` in `BasesStickyNoteView.ts` compares the entry's path
against `findOwningBaseFile()`'s path and renders a "This Base — open to view." placeholder
instead of an embed for that one case, avoiding a direct self-embed recursion into this same
view. **Not covered:** indirect/mutual cycles (Base A lists Base B, Base B's default view is
also Sticky Note and lists Base A) — no generic embed-depth tracking was added; relies on
whatever depth guard Obsidian's own embed renderer has, unverified. Flagged as a known gap
rather than silently assumed solved; revisit if native testing (STICKY-010) surfaces it.

**Dependencies:** STICKY-003.

**Likely files:** `src/views/sticky-note/BasesStickyNoteView.ts`, `src/styles/views/sticky-note.css`.

**Estimated scope:** S

### STICKY-009: Large-Base masonry reflow check

**Status:** In progress. Maintainer reported the view "feels heavy, glitchy" with visible
movement during initial load — two real causes found and fixed 2026-09-23, virtualization
decision still open.

**Fixes landed:**
1. **Layout thrashing in `masonry.ts`.** `layoutMasonrySection` wrote a card's `top`/`left`/
   `width` then immediately read the *next* card's height in the same loop iteration — a
   write-then-read-then-write pattern that forces a synchronous browser reflow on every single
   card, not once per relayout. Restructured into three passes: write every card's width, read
   every card's height once (a single reflow), compute the column assignment in pure JS, then
   write every card's position. `getColumnCount` unit-tested
   (`tests/sticky-note-masonry.test.ts`); the full batched layout isn't (this project's Vitest
   config has no DOM environment — see the test file's own scope note).
2. **Premature `ResizeObserver.observe()` during the initial render batch**, in
   `BasesStickyNoteView.render()`. Cards are built one at a time (`await MarkdownRenderer.render()`
   yields to the event loop per card); observing each card as soon as it existed let the
   observer's guaranteed initial fire — and the relayout it schedules — run mid-batch, against a
   still-growing card set, producing exactly the "cards keep shifting as more appear during
   initial load" the maintainer described. Now every card is built first, then all are observed
   in one pass, so the initial-fire storm coalesces into one relayout instead of several partial
   ones.

**Still open:** whether these two fixes are enough at genuinely large counts (200+), or whether
virtualization (spec §7's flagged gap — `linearVirtualRange.ts` doesn't fit a wrapping masonry
grid directly) is still needed. Decision deferred to the maintainer's own 50+/200+-entry retest
on the rebuilt version, not guessed at here.

**Dependencies:** STICKY-005.

**Estimated scope:** S

### STICKY-010: Native acceptance

**Status:** Not started. Blocked on all above.

**Description:** Full pass per spec §8.3 in a real vault; record in
`tasks/sticky-note/native-acceptance.md`. Update `ROADMAP.md`'s Sticky Note row to
**Done (native-accepted YYYY-MM-DD)**.

**Dependencies:** STICKY-004, STICKY-005, STICKY-007, STICKY-008, STICKY-009.

**Estimated scope:** M
