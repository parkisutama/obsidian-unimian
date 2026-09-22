# Spike report: masonry layout (STICKY-001)

Branch: `spike/sticky-note-masonry` (never merged; findings folded into `docs/specs/sticky-note.md` and the real implementation)
Plan: [plan.md](plan.md) Phase 0
Spec: [../../docs/specs/sticky-note.md](../../docs/specs/sticky-note.md) §8.1

## Attempt 1 (2026-09-22): CSS multi-column — failed native testing

Built with `column-width`/`column-gap`, `break-inside: avoid`, `min-width: 0`. Native test in a
real vault (screenshots reviewed 2026-09-22) found: **cards did not spread across the pane's
width.** Instead, one narrow column filled with a long card's full content, scrolling tall, while
most of the pane's width sat empty. A second screenshot (different content mix) did show 3
correctly-spread columns, so the failure is content-dependent, not universal — consistent with
the root cause: **CSS multi-column balances column *height*, not column *count***. With an
auto-height container and no `column-fill: balance` opportunity (or with one card much taller
than the rest), the browser can legitimately choose fewer columns than the available width would
allow. This is a different failure mode than any of Grid's original three, but the same class of
problem: a CSS layout technique behaving differently inside Bases' real scroll container than a
quick read of the spec would suggest.

**Verdict: attempt 1 rejected.** Not proceeding with CSS multi-column.

## Attempt 2 (2026-09-22): JS-driven shortest-column-first masonry

Replaced CSS `column-width` with `src/views/sticky-note-spike/masonry.ts`: column count computed
from container width via a breakpoint table (5/4/3/2/1 columns at 1400/1100/800/500/0px), each
card placed into whichever column is currently shortest, absolutely positioned
(`top`/`left`/`width` set per card; container height set to the tallest column). Relayout is
triggered on `ResizeObserver` (container width change) and on each card's image `load` event
(card height is unknown until images finish loading).

Design evidence: `rknastenka/obsidian-mini-notes` (MIT, design evidence only, no code copied —
see `docs/architecture/upstream-provenance.md`'s "Mini Notes (masonry layout)" entry). That
project's own `masonry.ts` documents the identical CSS multi-column failure mode found in
Attempt 1 and fixes it with the same shortest-column-first approach adopted here.

`pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` all pass on this branch with Attempt 2.

## Attempt 2 fix (2026-09-22): card overlap from late-arriving height changes

Native test found cards overlapping — content grew (embeds, tables) *after* the initial masonry
pass measured that card's height, and the per-image `load` listener never fired for non-`<img>`
content, so nothing triggered a relayout for those cards. `churnish/dynamic-views` (already an
approved-for-reference upstream, see its provenance entry) documents the identical problem and
solves it with a per-card `ResizeObserver` plus a delayed "safety net" remeasure — design evidence
only, no code copied (its own file is far more elaborate than this spike needs). Adopted the same
two mechanisms here: `cardResizeObserver` observes every card's own box size (catches any height
change regardless of cause), and a 500ms `setTimeout` safety net triggers one more relayout after
initial render in case something changes size later than both observers catch.

Also capped card height (`max-height: 480px`, `overflow: hidden`, fade-out gradient) per the
maintainer's request — matches the planned "card preview max height" option (spec §2.5) and
incidentally bounds the worst case of the height-balancing problem entirely (a card can never grow
past 480px regardless of content).

Files (spike-only, not part of the real Sticky Note implementation):
`src/views/sticky-note-spike/BasesStickyNoteSpikeView.ts`,
`src/views/sticky-note-spike/masonry.ts`, `src/styles/views/sticky-note-spike.css`, plus
temporary wiring in `src/main.ts` and `esbuild.config.mjs`.

## How to test in a real vault (manual — needs Obsidian itself)

1. On this branch, rebuild after any change: `pnpm run build`. Point an Obsidian vault's
   `.obsidian/plugins/wise-view/` at this repo checkout (or copy `main.js`, `styles.css`,
   `manifest.json` into that folder), then reload/enable the plugin.
2. Create or open a `.base` file with **50+ notes** of varying content length (some empty, some
   with tables, some with images, at least one with a table and at least one embedding another
   `.base` file).
3. Add a view, pick **"Sticky Note (spike)"**.
4. Check each row below and mark it.

## Checklist (Attempt 2 — JS-driven masonry)

| Check | Result | Notes |
|---|---|---|
| Initial render — cards appear, heights vary naturally with content | ✅ confirmed | 2026-09-22 screenshots |
| Cards spread across the full pane width (the Attempt 1 single-column collapse does not recur) | ⬜ pending | needs retest with masonry.ts |
| Resize the pane to desktop / tablet / mobile widths — columns reflow, no horizontal scrollbar | ⬜ pending | |
| Scroll performance with 50+ cards | ⬜ pending | |
| Light theme | ⬜ pending | |
| Dark theme | ⬜ pending | |
| A table inside a card renders correctly, does not overflow the card | ✅ confirmed | 2026-09-22 screenshot (raw YAML table-like content rendered as plain text, not a real Markdown table in that specific card — expected, see below) |
| A card whose note embeds another `.base` file renders without breakage or infinite recursion | ⚠️ partial | the `.base` file's own entry renders its raw YAML source as plain text (expected — spike does not special-case `.base` embeds; real implementation needs `.base`-aware embed handling, tracked as a Phase 1/2 refinement, not a Gate 1 blocker) |
| An image inside a card loads and does not distort card width (async load reflow) | ✅ confirmed | width stayed fixed per column; card height grew, triggering relayout |
| No card ever collapses/flattens to a uniform strip (Grid's fatal `content-visibility` bug) | ✅ confirmed | not present in either attempt |
| No console errors | ⬜ pending | |

## Content-model fix (2026-09-22): bounded excerpt, `.base`/`.canvas` special-casing, title dedup

Following the maintainer's request to adopt both reference projects' content-model choices (spec
§5.4), the spike now: (1) truncates raw text to an 800-char budget at the last newline before
handing it to `MarkdownRenderer` (`content.ts` — `buildCardExcerpt`), instead of rendering the
whole note and CSS-clipping it; (2) detects `.base`/`.canvas` extensions and renders them as a
real `![[path]]` embed instead of raw YAML/JSON text; (3) drops a leading H1 that exactly matches
the card's title, avoiding the title-shown-twice duplication seen in earlier screenshots.

`pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` all pass with this change.

## Content-model fix 2 (2026-09-22): cover image, inline-image stripping, Quick Preview reuse

Following further review against both references plus the maintainer's own existing Quick
Preview popup (`QuickPreviewModal`), three more changes (spec §5.4.5, §5.4.6):

1. Inline image embeds are now stripped from the excerpt entirely (`stripInlineImages` in
   `content.ts`) — resolves the "single large image dominates a card" item noted above, more
   robustly than a height cap alone (the image no longer renders in the excerpt at all).
2. A cover banner renders above the excerpt when the entry's frontmatter has a resolvable image
   in a configured property — spike hardcodes the property name to `feature` (real
   implementation reads this from a view option, STICKY-005), resolved via the already-reused
   `CoverImageResolver`. Styled with the `height:0`/`padding-top` percentage technique (no
   `aspect-ratio`), matching card.css's existing Swimlane cover treatment.
3. Card clicks now open the existing `QuickPreviewModal` via `activateEntry()` (the same path
   Timeline uses) instead of doing nothing — gets editable properties, "Linked mentions"
   backlinks, and the real embedded leaf for free, without building any of that inside the card
   grid itself. A click on a link/embed inside the excerpt is excluded (`closest('a,
   .internal-embed')` guard) so it still behaves normally.

`pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` all pass with these changes.

## Verdict (Gate 1) — PASSED, 2026-09-22

- [x] Proceed with JS-driven masonry for the real Sticky Note implementation (Phase 1+).

Confirmed via multiple rounds of native testing in a real vault: cards spread across the full
pane width at normal widths, no flatten/collapse regression, no overlap (after the per-card
`ResizeObserver` + safety-net fix), cover banner and excerpt both render correctly, `.base`
entries render as a real embed instead of raw YAML, title dedup works, and card clicks open the
existing `QuickPreviewModal`. Not independently re-verified in this pass: resize across
desktop/tablet/mobile breakpoints specifically, dark theme, and a clean console — carried forward
as native-acceptance items (spec §8.3) for the real implementation rather than re-blocking Gate 1
on them, since none of the confirmed rounds suggested a regression in those areas.

Remaining rough edges — explicitly **not** Gate 1 blockers, deferred to Phase 1/2 where a real
options system exists to address them properly:

- Table columns can wrap awkwardly at narrow card widths (needs the real `Card width` option,
  STICKY-005) — a spike-only fixed width was never going to look right for every table shape.
- Cover image property is hardcoded to `feature` for the spike; needs a real `Cover image
  property` view option (STICKY-005).
- No image-fit/cover-sizing option yet (STICKY-005).

**Next:** close the spike branch (code stays there, never merged — this report is the surviving
deliverable, copied to `main`). Begin Phase 1 (STICKY-002/003) on `main` for a real, registered
`wise-view-sticky-note` with an actual Bases view options schema.
