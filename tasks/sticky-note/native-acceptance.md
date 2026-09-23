# Native acceptance: Sticky Note

Spec: [../../docs/specs/sticky-note.md](../../docs/specs/sticky-note.md)
Date: 2026-09-23
Accepted by: maintainer

## Verified

Across multiple rounds of real-vault testing (including a 515-note Base, the scale that
surfaced most of the findings below):

- Card rendering: excerpt truncation, title dedup, cover image, per-card accent color,
  `.base`/`.canvas`/image/PDF entries embedding correctly instead of being read as prose.
- Masonry layout: cards spread across the full pane width at multiple pane sizes, no
  flatten/collapse regression, no visible overlap.
- Pin-to-top: pin/unpin persists across Obsidian restart, scoped per `.base` file, survives
  renaming the pinned note or the `.base` file itself.
- Card click opens the existing `QuickPreviewModal` (editable leaf, native Properties widget,
  "Linked mentions" backlinks) rather than a view-specific reimplementation.
- Large-Base performance (515 notes): initial load, scrolling (including fast scroll up/down),
  and editing a note while the view is open all confirmed acceptable by the maintainer after the
  fixes below landed. No console errors reported during any round.
- Light theme verified throughout (the maintainer's own vault). Dark theme not separately
  re-verified in this pass — no theme-specific issue was reported in native testing, and the
  color/CSS-variable approach used throughout (`--wise-view-color-bg`, `--modal-background`,
  etc.) does not special-case light mode.

## Issues found during native testing and fixed before acceptance

This workstream's real-world testing surfaced significantly more than the original spec
anticipated — recorded in full in `tasks/sticky-note/todo.md` (STICKY-008/009/011); summarized
here for the acceptance record:

1. Image/binary entries rendered as garbled raw bytes — fixed by flipping to a positive
   text-extension list (`TEXT_EXCERPT_EXTENSIONS`).
2. Layout thrashing in the masonry algorithm (interleaved DOM read/write per card) — fixed by
   batching reads and writes into separate passes.
3. `onDataUpdated()` firing far more often than the query result actually changes — fixed with
   `RenderScheduler`/`computeRenderSignature` (skip-if-identical), the same mechanism Calendar
   already uses.
4. No incremental re-render — a single file's mtime change was rebuilding all 515 cards — fixed
   with a keyed `cardsByPath` cache that only rebuilds what actually changed.
5. Initial-load delay at 515 entries — fixed by virtualizing the "Others" section (render ~2
   screens eagerly, promote placeholders via `IntersectionObserver` as the user scrolls).
6. Fast-scroll promotion gaps and a "stuck-looking" placeholder queue — fixed by bounding
   promotion batch size and guarding against overlapping flushes.
7. A `.canvas` entry showed no useful card preview — fixed with an explicit placeholder.
8. Quick Preview toolbar background mismatch, a redundant "Open in tab" button, and
   "Linked mentions" closing instead of chaining — all fixed in the shared `QuickPreviewModal`.

## Waived / explicitly deferred (not blocking acceptance)

- **`.base` self-embed guard is narrow** (STICKY-008): only the direct case (a Base file listing
  itself as an entry) is guarded. Indirect/mutual cycles (Base A lists Base B, whose own default
  view lists Base A) are not generically guarded — relies on whatever depth guard Obsidian's own
  embed renderer has, unverified.
- **Virtualization is heuristic, not exact** (STICKY-009): window sizing and placeholder height
  are rough estimates (container size ÷ an assumed card height), not measured. Accepted as
  sufficient — native testing did not surface a case where the heuristic produced a visibly wrong
  layout, only timing (addressed by the batching/IntersectionObserver fixes above).
- **Typing responsiveness inside Quick Preview**: confirmed acceptable after the incremental
  re-render fix, but not independently profiled beyond the maintainer's own testing.
- **Mobile UX**: per `ROADMAP.md`'s standing Follow-up, every view (Sticky Note included) is
  functional but tuned for desktop; mobile is a deliberately deferred, separate workstream.
- **Dark theme**: not independently re-verified in this pass (see above).

## Definition of done (spec §9) — status

All items are met: view registered and rendering per spec, pin/color working as decided, no
delete/trash capability shipped, the Grid-era roadmap reversal recorded, and `pnpm run check`
passing at every commit in this workstream.
