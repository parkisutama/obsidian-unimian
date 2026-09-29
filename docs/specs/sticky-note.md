# Spec: Sticky Note view

Status: Done (native-accepted 2026-09-23) — [record](../../tasks/sticky-note/native-acceptance.md)
Baseline branch: `main` (not `dev` — `QuickPreviewModal`, which §5.4.6 depends on, only exists on
`main` as of 2026-09-22; `dev` is one commit behind)
Prepared: 2026-09-22
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)

## 0. Roadmap context (why a new view, now)

`ROADMAP.md` records that the previous program planned five new view types (Grid, Masonry, Feed,
Keep) alongside Timeline, and that **Grid was removed** after three rounds of native-testing
failures — all CSS layout regressions in Obsidian's Bases scroll container (last one:
`content-visibility: auto` flattening every card to a uniform strip; see
`docs/architecture/upstream-provenance.md`'s Dynamic Views entry). That result changed priority to
"harden what already ships before adding another new view type."

**Sticky Note is, in spirit, the "Keep" entry from that same descoped list**, reproposed by the
maintainer on 2026-09-22 as a deliberate reversal of that priority for this one view, not a
blanket resumption of the whole five-view program. This spec exists specifically to avoid
repeating Grid's failure mode — see §6 (Layout approach) and §7 (Risks) for how.

## 1. Objective

A new Bases view, "Sticky Note" (current id `unimian-sticky-note`), that renders entries as a
Google-Keep-style card grid: a **bounded Markdown excerpt** per card (not the whole note —
see §5.4), tables and inline formatting rendered through Obsidian's own `MarkdownRenderer`,
per-card accent color, and a plugin-level pin-to-top feature — without writing anything to note
frontmatter for view-only state (color stays a property; pin does not).

References for the card-grid *interaction and content-model* shape (not code, see §5.4 and
`docs/architecture/upstream-provenance.md` for what each contributes and why nothing is copied):
<https://github.com/k4fn/keep-bases-view> and <https://github.com/rknastenka/obsidian-mini-notes>.
Unimian's approach to color, layout, and persistence deliberately differs from both; see §5
and §6.

## 2. Scope

1. **View registration.** `unimian-sticky-note` in `src/viewRegistry.ts`, displayed as "Sticky
   Note", read-only (no `capabilities.mutations`, no `legacyMutation` — see §5.3).
2. **Card rendering.** Each card renders a **bounded excerpt** of the note's own content/body
   (not a synthetic template, not the whole note) via Obsidian's `MarkdownRenderer.render()`, so
   tables and inline formatting render exactly as they would in Obsidian itself, within the
   excerpt. See §5.4 for the excerpt/truncation rules, title-dedup, and `.base`/`.canvas`
   special-casing (never raw-dumped as YAML/JSON text).
3. **Color.** Resolved per card via the existing `resolveColor()`
   (`src/platform/colors/ColorResolver.ts`) — explicit property → Pretty Properties → valueStyles
   → deterministic fallback. No new color logic.
4. **Pin-to-top.** A plugin-level, per-Base pinned set (§5.1) that visually sorts pinned cards
   into their own "Pinned" section above "Others" (matching the reference screenshot's grouping),
   toggled from each card, never written to the note.
5. **Card layout options.** Base view options (`src/platform/bases/viewOptionTypes.ts` +
   `ViewConfigReader`) for: card title property, cover image property, color property, image
   fit, card width (desktop/tablet/mobile), excerpt character budget — mirroring the "Configure
   view" panel already shown for the reference plugin, adapted to Unimian's own options schema
   conventions (see Gantt/Calendar `options` callbacks for the pattern). "Show tags" is *not*
   part of v1 (§5.4.4 — inline `#tags` already render as pills, so a separate tag row would be
   genuine duplication, not a distinct feature); revisit only alongside a real design for that
   row.
6. **Delete/trash is explicitly out of scope for this spec** — see §5.3.

## 3. Non-goals

- No delete/trash affordance on the card (§5.3). Users delete notes through Obsidian's own file
  explorer / context menu, unaffected by this view.
- No revival of Grid, Masonry, or Feed. This spec covers Sticky Note only; any of those three
  needs its own spec and its own maintainer sign-off, not an inference from this one shipping.
- No new Markdown rendering engine. Card content goes through Obsidian's own
  `MarkdownRenderer`, not a hand-rolled renderer (unlike the `k4fn/keep-bases-view` reference,
  which the user's brief notes has no CSS/TS of its own to draw from anyway).
- No writing of color, pin, or any other view-only state into note frontmatter. Color is read
  from whatever property the user already has (existing behavior via `ColorResolver`); this view
  never sets it.
- No cross-device/cross-vault sync of pinned state beyond what Obsidian's own vault
  sync/`data.json` already provides.

## 4. Reused building blocks

Concrete, already-in-tree pieces this view builds on instead of re-implementing:

| Concern | Reused from |
|---|---|
| Entry snapshotting / change detection | `src/core/entries/EntrySnapshot.ts`, `src/platform/bases/entrySnapshotAdapter.ts`, `src/platform/bases/changeDetection.ts` |
| Color resolution | `src/platform/colors/ColorResolver.ts` |
| Cover image resolution | `src/platform/dom/CoverImageResolver.ts` (used by Swimlane today) |
| View option reading | `src/platform/bases/ViewConfigReader.ts`, `src/platform/bases/viewOptionTypes.ts` |
| View registration/capabilities | `src/viewRegistry.ts` |
| Virtualized rendering (if card count is large) | `src/core/layouts/linearVirtualRange.ts` — note this is a **linear** range helper; a masonry/wrapping grid needs its own virtualization strategy or none at v1 (see §7) |

## 5. Design decisions (maintainer, 2026-09-22)

### 5.1 Pinned state: plugin data, scoped per Base file, rename-safe

- **Not a note property.** Pin state is exclusive to this view and must never touch frontmatter.
- Stored in the plugin's own `data.json` (via `loadData()`/`saveData()`, the same mechanism
  `UnimianSettings` already uses — `src/main.ts:132`), under a new namespace:

  ```ts
  interface StickyNoteData {
    pinnedByBase: Record<string /* base file path */, string[] /* pinned note paths */>;
  }
  ```

- **Scope: per Base file.** The same note can be pinned in one `.base` file's Sticky Note view
  and not in another — each `.base` path is its own key. (Decided over "global per vault" and
  "per view instance": per-Base is granular enough for the exclusive-to-this-view intent without
  the fragility of keying on a view/block instance id that Bases does not stably expose.)
- **Implementation note (2026-09-22): no public API gives a `BasesView` its own `.base` file
  path** (checked `BasesView`/`QueryController`/`BasesViewConfig`/`BasesViewFactory` in
  `obsidian.d.ts`). `src/views/sticky-note/ownerBaseFile.ts` finds it through only public API:
  `Workspace.iterateAllLeaves()` to find the leaf whose `FileView.containerEl` contains this
  view's, then that `FileView`'s public `.file`. An embedded Base
  (`![[Foo.base]]` inside another note) resolves to the embedding note's path instead of
  `Foo.base`'s — accepted as a real, stable scope one level up from ideal in that one case,
  rather than reaching for an undocumented internal property (this project already avoids that
  pattern elsewhere — see `backlinks.ts`'s public `resolvedLinks` choice).
- **Rename safety.** The plugin listens to `vault.on('rename', ...)` and, on every rename event,
  rewrites any matching **note path** across all `pinnedByBase` entries, and any matching
  **Base file path** as a `pinnedByBase` key — so moving/renaming either side of the mapping does
  not silently drop a pin.
- A note or Base file that no longer exists (deleted, not renamed) can be pruned lazily on next
  load rather than tracked reactively — a stale pinned-path is harmless (it simply never
  matches an entry) so eager cleanup is not required for correctness.

### 5.2 Color: unchanged existing property-based resolution

Confirmed with the maintainer: color stays a property, resolved through the existing
`ColorResolver` exactly as Swimlane/Calendar already do it. Sticky Note introduces no new color
storage or resolution logic — only a `colorProperty` view option telling `ColorResolver` which
property to treat as `explicitColor`, the same pattern Swimlane's options already use.

### 5.3 No delete/trash capability in v1

`src/platform/mutations/grants.ts` documents an explicit, deliberate constraint: *"Trash and
move are deliberately not grantable"* through the scoped `MutationGrant` system every view added
since the legacy Calendar/Gantt/Swimlane trio must use (`view-write-access.md`). Adding `trash`
as a grantable capability for a new view is its own decision record, not something this spec
should fold in as a side effect of wanting a delete button.

**Decision (2026-09-22):** Sticky Note ships v1 with no delete affordance on the card. It is a
pure read-only view (no `capabilities.mutations`, no `legacyMutation`). If delete-from-card is
wanted later, it needs its own decision record in `docs/architecture/view-write-access.md`
(naming the view, why trash specifically, and the maintainer's sign-off) before any
`trashFile`/gateway `trash()` call is wired up — the architecture guard in
`tests/architecture.test.ts` enforces this is not bypassed quietly.

### 5.4 Card content model: bounded excerpt, not the whole note (revised 2026-09-22)

**The problem found in native testing:** the STICKY-001 spike originally rendered each entry's
*entire* cached file content through `MarkdownRenderer`, then relied on CSS `max-height` +
`overflow: hidden` to visually clip it. Native testing surfaced two consequences of that: (1) a
card whose entry was itself a `.base` file dumped its raw YAML source as plain text — nothing
about "render the whole file" knows a `.base`/`.canvas` file's raw text isn't meant to be read
that way; (2) rendering (and, worse, re-measuring via masonry relayout) the *entire* note's DOM
just to show a clipped fraction of it is wasted render/layout cost that scales with note length,
not with what's actually visible.

Both reference projects avoid this, in different ways worth combining:

- **`rknastenka/obsidian-mini-notes`** (MIT, design evidence only, no code copied) truncates the
  **raw text** to a fixed character budget (`MAX_PREVIEW_LENGTH = 800`, broken at the last
  newline before the limit so Markdown structure isn't sheared mid-line) *before* handing it to
  `MarkdownRenderer` — so only the excerpt is ever parsed/rendered, not the whole note. It also
  strips inline `#tags` from the excerpt text (shown separately in a tag row instead) and caps
  checklist items shown per card (a separate cap, since task lists don't shrink under a paragraph
  line-clamp).
- **`k4fn/keep-bases-view`** (MIT, design evidence only — bundle-only upstream, no TypeScript
  source available, see its provenance entry's "Bundle-only limitation") has an explicit toggle
  (`showBasePreview`/`basePreviewHeight` option names observed in its bundle) for entries that are
  themselves `.base` files: render a real embedded Bases preview instead of raw content.

**Decision (2026-09-22):** Sticky Note adopts both, reimplemented independently (no code from
either project):

1. **Text-level excerpt, not CSS-only clipping.** Before calling `MarkdownRenderer.render()`,
   truncate the note's raw text to a configurable character budget (default matching Mini Notes'
   800, exposed as a view option — not hard-coded), breaking at the last newline at or before the
   limit. CSS `max-height`/`overflow: hidden` remains as a defensive backstop (a single unbroken
   long line, or Markdown that expands unpredictably — e.g. a large table — could still overflow
   the character budget's visual height), not the primary truncation mechanism.
2. **Only text-file extensions are read as prose; everything else embeds.** `content.ts`'s
   `TEXT_EXCERPT_EXTENSIONS` (`md`/`markdown`/`txt`) is a positive list, not a negative one —
   revised 2026-09-23 after native testing at 515 entries found an image (`.png`) entry's raw
   bytes rendered as garbled binary-as-text (a negative list of "known binary extensions" would
   have needed to enumerate every image/PDF/etc. format; a positive list of "known text formats"
   is the safer default). `.base`/`.canvas` and any binary format render as a real embed
   (`![[path]]` — `MarkdownRenderer` already resolves this against Obsidian's own embed support)
   except the one case guarded by STICKY-008 (a `.base` entry that is the view's own owning Base
   file, to avoid self-embed recursion), which gets a "Base file — open to view" placeholder
   instead.
3. **Title de-duplication.** If the note body's first block is a level-1 heading whose text
   matches the card's title (from the configured title property, or the filename), that heading
   is skipped when rendering the excerpt — the card's own title element already shows it once.
   Matching is exact-text-after-trim; no fuzzy matching, so a heading that merely resembles the
   title still renders (avoids false positives silently eating real content).
4. **Tags are not duplicated between excerpt and a separate row at v1.** Mini Notes' tag-stripping
   is design evidence for a *future* "Show tags" option (already scoped in §2.5), not built now —
   at v1, `#tags` inline in the excerpt render exactly as Obsidian already renders them
   (clickable tag pills via `MarkdownRenderer`'s own handling), which is not visual duplication.
   Revisit only if the "Show tags" option (§2.5) is implemented and produces genuine duplication.
5. **Inline images are stripped from the excerpt; the cover image property is the only way an
   image appears on a card (revised 2026-09-22, native test).** Native testing showed an
   uncontrolled inline image (a portrait photo) dominating a card's height even under the excerpt
   budget. Rather than `k4fn/keep-bases-view`'s observed behavior (an unconfigured image shows as
   literal unrendered path text), Sticky Note removes inline image embeds (`![[...]]` targeting an
   image extension, and Markdown `![...](...)` syntax) from the excerpt entirely — cleaner than
   showing a raw path, and it means the excerpt and the cover banner (§2.5's `Cover image
   property`, resolved via the already-reused `CoverImageResolver`) can never show the same image
   twice, without needing separate same-image dedup logic. A future "Show inline images" option
   could relax this; not built at v1.
6. **Card click opens the existing Quick Preview popup, not a new property/backlinks UI.**
   Building editable-property and backlinks panels per card would mean re-deriving what
   `QuickPreviewModal` (`src/platform/preview/QuickPreviewModal.ts`) already does well, and doing
   it 50-200 times over (once per visible card) is not the same cost as one popup at a time.
   Sticky Note cards wire clicks through the same `activateEntry()`/`QuickPreviewModal` path
   Timeline and other views already use (`src/platform/navigation/NavigationService.ts`) — full
   editable properties, backlinks ("Linked mentions"), and the real embedded leaf come from that
   existing, already-liked popup, not a reimplementation. A click on a link or embed *inside* the
   excerpt still behaves as that link/embed normally would (does not also open Quick Preview).

## 6. Layout approach (the part that broke Grid three times)

Grid's failures were all CSS techniques interacting badly with Obsidian's Bases scroll container,
not conceptual masonry-layout mistakes:

1. Missing `min-width: 0` on grid items.
2. `aspect-ratio` cover sizing instead of `height:0`/`padding-top` percentage technique.
3. `content-visibility: auto` misfiring inside the Bases scroll container — the fatal one,
   found only after three rounds of native testing, and the reason Grid was removed rather than
   patched a fourth time.

**Sticky Note deliberately avoids the same failure surface:**

- Layout technique is **JS-driven shortest-column-first masonry**: column count computed from
  container width via a breakpoint table, each card placed into whichever column is currently
  shortest, absolutely positioned (`position: absolute`, `top`/`left`/`width` set at layout
  time) — never `display: grid`, and never CSS `column-width`/`column-count` either.
  **Revised 2026-09-22** after the STICKY-001 spike's first attempt (CSS multi-column) failed
  native testing in a real vault: multi-column balances column *height*, not column *count* — a
  single tall card made the browser collapse the whole grid to one narrow column instead of
  spreading across the pane, leaving most of the pane's width empty. Design evidence for the
  JS-driven replacement: `rknastenka/obsidian-mini-notes` (MIT, design evidence only, no code
  copied — `docs/architecture/upstream-provenance.md`'s "Mini Notes (masonry layout)" entry),
  whose own `masonry.ts` documents this exact CSS multi-column failure mode.
- `min-width: 0` and `box-sizing: border-box` applied to every card as a defensive baseline.
- Cover images use the `height:0`/`padding-top` percentage technique already proven in
  `src/styles/components/card.css`'s existing cover treatment (Swimlane) — reused, not
  reinvented.
- No `content-visibility` anywhere in Sticky Note's stylesheet. If large-Base performance later
  needs it, that is a follow-on spike with its own native-testing gate, not a default.
- Relayout is triggered on container resize (`ResizeObserver`) and on each card's image `load`
  event (card heights are unknown until images load, and JS-driven masonry — unlike CSS
  multi-column — does not reflow itself automatically when content height changes later).

## 7. Risks

- **Masonry relayout cost.** JS-driven masonry calls `getBoundingClientRect()` per card on every
  relayout (resize, image load, embedded `.base` render completing later); at large card counts
  this is a synchronous layout cost CSS multi-column did not have. Needs native testing with a
  large Base (see `docs/specs/performance.md` precedent) before Done — if STICKY-009 finds it too
  slow, revisit the upstream height-cache/invalidation scheme noted as excluded in the provenance
  ledger's "Mini Notes (masonry layout)" entry.
- **Nested `.base` embeds inside a card.** Rendering `MarkdownRenderer` against a note that itself
  embeds another `.base` file recurses into Bases' own rendering. Needs an explicit test for
  infinite-recursion guard (a Base card embedding the same Base file) before Done.
- **No virtualization at v1.** `linearVirtualRange.ts` assumes a single-axis linear list; a
  wrapping multi-column masonry does not fit that shape directly. v1 renders all cards
  unvirtualized (acceptable per Grid's own original scope for typical note counts) — bounded
  rendering for very large Bases is deferred, flagged here rather than silently dropped.
- **Given Grid's history, a spike/gate before full build is required**, not optional — see the
  implementation plan's Phase 0.

## 8. Verification policy

1. Before full implementation, a throwaway-branch layout spike proves the masonry approach
   renders correctly in a real vault: desktop, resizing the pane, light/dark theme, a Base with
   50+ entries, and at least one card containing an embedded `.base`. Recorded in
   `tasks/sticky-note/spike-report.md` (mirrors Gantt's Phase 0 gate).
2. Unit tests cover: pin persistence round-trip (add/remove/rename-migration), color resolution
   delegation (reuses existing `ColorResolver` tests' pattern, not duplicated), view option
   parsing/defaults, excerpt truncation (breaks at last newline, respects the character budget
   option, never shears mid-Markdown-block in a way that breaks rendering), title-dedup matching
   (§5.4.3), and `.base`/`.canvas` detection never falling through to raw-text rendering.
3. Native acceptance in a real vault before Done: card rendering (tables, embeds, images), pin/
   unpin persists across Obsidian restart, color reflects the configured property, layout options
   from §2.5 all take effect, no console errors, light and dark theme.
4. `pnpm run check` passes; `tests/architecture.test.ts`'s guard confirms no mutation call exists
   in `src/views/sticky-note/` (per §5.3, this view must stay guard-clean with zero grants).

## 9. Definition of done

1. `unimian-sticky-note` registered, renders cards per §2, with pin (§5.1) and color (§5.2)
   working exactly as decided here.
2. No delete/trash capability shipped (§5.3) — deferred to its own future decision record.
3. Layout spike (§8.1) passed before full build began; native acceptance (§8.3) passed before
   Done.
4. `ROADMAP.md`'s workstream table has a Sticky Note row, and its "why a new view now" reversal
   of the Grid-era priority is recorded there, cross-referencing this spec's §0.
5. `pnpm run check` passes.
