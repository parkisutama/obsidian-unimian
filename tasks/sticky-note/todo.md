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

**Status:** Complete (2026-09-23). Maintainer confirmed after the batching/`IntersectionObserver`
fixes: "oke sekarang jauh lebih baik ... bisa dianggap close soal peforma view". Maintainer tested
against a real 515-note Base and reported: heavy/glitchy feel, delay on first open and on
opening Quick Preview, visible movement during initial load, jank during editing (specifically
when a linter plugin's autofix touches a file), and one entry rendering as garbled binary text.
Five real causes found and fixed 2026-09-22–23, ending with the virtualization decision the
maintainer explicitly asked for.

**Fixes landed:**
1. **Layout thrashing in `masonry.ts`** — write-then-read-then-write per card forced a
   synchronous reflow on every single card. Restructured into three passes (write all widths,
   read all heights once, compute placement in pure JS, write all positions).
2. **Premature `ResizeObserver.observe()` during the initial render batch** — observing each
   card as soon as it existed let the observer's initial fire (and the relayout it schedules)
   run mid-batch against a still-growing set. Now every card is observed in one pass after the
   whole batch is built.
3. **No incremental re-render** (the STICKY-003 deviation flagged early on, now confirmed to
   matter at real scale). At 515 notes, a *single* file's mtime bump — e.g. a linter plugin
   reformatting a file on save — was rebuilding all 515 cards from scratch, which is exactly the
   "jank while editing" the maintainer reported. `BasesStickyNoteView` now keeps a
   `cardsByPath: Map<path, CardEntry>` and only rebuilds a card whose `mtime` actually changed;
   everything else is reused (just re-parented to the correct grid/pin-button state if its
   pinned status flipped). A content-affecting option change (title/cover/color property,
   excerpt budget) still forces a full rebuild via a separate `lastOptionsKey` check — a
   CSS-only option change (card width, max height, image fit) does not, so dragging a slider
   doesn't re-render 515 notes' markdown on every tick.
4. **A `.png`/binary entry rendered as garbled text** — `content.ts` previously special-cased
   only `.base`/`.canvas` as "never read as prose"; every other extension, including images,
   went through `cachedRead()` + excerpt + `MarkdownRenderer`, so an image file's raw bytes were
   rendered as if they were Markdown (screenshot: literal `PNG`/`IHDR`/chunk data as card text).
   Flipped to a positive list (`TEXT_EXCERPT_EXTENSIONS = md/markdown/txt`) — everything else now
   embeds via `![[path]]` instead of being read as text. The `.base` self-embed guard (STICKY-008)
   is now scoped specifically to `file.extension === 'base'`, since it doesn't apply to images/PDFs.

**Retest findings (2026-09-23, real 515-note Base) and fixes:**
- Quick Preview now "feels natural, faster than before" — confirms its earlier reported delay
  was downstream contention from the Sticky Note view's own render cost, not a separate bug in
  Quick Preview itself. Nothing further changed there.
- **FOUC:** for 1-2 seconds on open, cards showed as a raw, unstyled stacked list before
  "becoming" the masonry grid — expected given cards render in normal document flow until their
  first `position: absolute` placement lands, and building the first batch of 515 takes a
  visible moment. Fixed by hiding each grid (`opacity: 0`) until its first relayout completes,
  then fading in once (`.is-ready` class, added permanently after the first successful layout —
  not re-hidden on later updates).
- **A `.canvas` entry showed no useful preview in the card**, only once opened in Quick Preview.
  Spec §5.4.2 already called for a placeholder here ("canvases have no meaningful bounded-height
  inline preview") but it was never implemented — only the `.base` self-reference case got one.
  Added the same placeholder treatment for every `.canvas` entry.
- **Cards visibly reposition when Quick Preview closes at the same time as a linter autofix** —
  maintainer confirmed this is expected/acceptable (comparable to Google Keep recalculating
  positions when content genuinely changes), not something to suppress.
- **Typing inside Quick Preview feels less responsive, with background cards moving** —
  maintainer confirmed **fixed** after the incremental-render change (fix 3 above) landed;
  re-tested and reported "sekarang mengetik sudah cukup responsif" (typing is now responsive
  enough). The one nearby card still shifting when the edited note's height changes is expected
  (same reasoning as the linter-autofix case above).
- **Initial-load delay at 515 entries, still not "instant" (cards still don't appear
  immediately as cards)** — maintainer confirmed noticeably faster than before but still
  present, then explicitly asked to proceed with virtualization rather than accept it. Fixed:
  `BasesStickyNoteView`'s "Others" section now only fully renders roughly the first two screens'
  worth of entries up front (`computeWindowCount()`); the rest get a cheap fixed-height
  placeholder (`createPlaceholder()`, no `MarkdownRenderer`, no `Component`) promoted to a real
  card as the user scrolls near it. A card, once promoted, is never demoted — see
  `src/views/sticky-note/BasesStickyNoteView.ts`'s own field comments for the exact mechanism.
  "Pinned" is not windowed (assumed small).
  - **Follow-up fix:** the first version promoted on a `scroll`-event distance check
    (`promoteNextBatch()`), measured against the bottom of the *whole* page — including every
    not-yet-promoted placeholder's estimated height — so it only fired near the very end of all
    515 entries. A fast scroll past the initial window landed on bare placeholders with nothing
    promoting them ("lazy load nya too lazy saat di scroll cepat"). Replaced with an
    `IntersectionObserver` (`placeholderObserver`) observing each placeholder directly with a
    generous `rootMargin` — it tracks actual element geometry regardless of scroll speed/distance,
    so a fast scroll or jump is caught correctly. `schedulePromote()`/`flushPromotions()` coalesce
    intersections into one batch/relayout via rAF.

**Dependencies:** STICKY-005.

**Estimated scope:** M (grew from S — the incremental-render change and the virtualization pass
were both real architecture additions, not small tweaks)

### STICKY-010: Native acceptance

**Status:** Complete (2026-09-23). Maintainer confirmed the workstream done after extensive
real-vault testing (515-note Base) across every phase above — record in
[native-acceptance.md](native-acceptance.md). `ROADMAP.md`'s Sticky Note row updated to
**Done (native-accepted 2026-09-23)**.

**Dependencies:** STICKY-004, STICKY-005, STICKY-007, STICKY-008, STICKY-009.

**Estimated scope:** M
