# Spec: Gantt code quality, dependency editing, and the Frappe Gantt listener leak

Status: Superseded 2026-09-20 — the Frappe Gantt view was removed (docs/specs/gantt-frappe-removal.md); kept as history
Baseline branch: `dev`
Prepared: 2026-09-19
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)

## 1. Objective

Reduce `src/views/BasesGanttView.ts` (~1,660 lines) into a slim view class plus focused modules,
add interactive dependency-line editing, and resolve (or concretely bound) the known Frappe Gantt
`document`-level listener leak — without changing Gantt's persisted `.base` option keys or view ID.

## 2. Scope

### 2.1 Code organization

Split the file along its existing seams (see §5) into a `src/views/gantt/` directory, mirroring
`src/views/timeline/`'s pattern.

### 2.2 Interactive dependency-line editing

Today, a task's dependencies are set only through the "Dependencies" property (a comma/array of
note references) or a right-click context menu ("Add dependency" / "Clear dependencies"); Frappe
Gantt then draws the connecting arrows from that data as pure, non-interactive visualization.

Add: dragging a bar's dependency handle to another bar creates or re-points a dependency; dragging
an arrow away from a bar removes it. Every interactive change writes back to the same
"Dependencies" property the context-menu actions already use — single source of truth, no
separate internal dependency state kept only in memory.

Frappe Gantt does not support this interaction natively, so the implementation plan must address,
before committing to an approach:

- A custom SVG interaction overlay on top of Frappe Gantt's rendered arrows (hit-testing arrow
  endpoints, drawing a live drag-preview line, committing on drop), versus
- Whether a newer Frappe Gantt version changes this calculus (check its changelog — this overlaps
  with §2.3's version-upgrade investigation, do both checks together).

### 2.3 Frappe Gantt `document`-level `mouseup` listener leak

Recorded since T010 in `docs/architecture/upstream-provenance.md`'s "Known upstream library
limitations": `frappe-gantt@1.2.2`'s `Gantt` constructor attaches
`document.addEventListener('mouseup', ...)` internally and never removes it; Wise View's own
architecture guard (no global-API monkey-patching) forbids the previous capture-and-remove
workaround. One listener leaks per `new Gantt(...)` call for the life of the Obsidian window.

Investigate, in order, stopping at the first that resolves it:

1. A Frappe Gantt version newer than 1.2.2 that fixes this upstream (check its changelog for
   breaking changes against our usage before upgrading).
2. A supported teardown/`off` method or constructor option added since 1.2.2 to suppress this
   binding.
3. Vendoring a minimally patched build (a local copy of just the offending `bind_bar_events`
   binding) with a proper SPDX/attribution header and a `THIRD_PARTY_NOTICES.md` entry for the
   modification.
4. If all three are rejected as disproportionate to the risk, document a concrete, quantified
   bound on the impact (how large the leaked closures are, how often a rebuild actually happens in
   practice) rather than leaving it an open-ended "known limitation" forever.

## 3. Non-goals

- No change to the Note Template feature (`NoteTemplateService`, shared with Calendar) —
  `docs/specs/note-template.md` owns that, sequenced after Performance.
- No change to Gantt's WBS sidebar behavior beyond what the reorganization requires.
- No performance work beyond what naturally falls out of the split; large-Base verification is
  `docs/specs/performance.md`'s job.

## 4. Non-goals — scope guard for §2.2

The dependency-line editor writes to the existing "Dependencies" property only. It must not
introduce a second, competing dependency representation, and must not remove or change the
existing context-menu "Add dependency"/"Clear dependencies" actions — the drag interaction is an
additional way to reach the same mutation, not a replacement.

## 5. Current internal seams (what to split along)

| Concern | Approximate responsibility |
|---|---|
| Frappe Gantt lifecycle wrapper | `new Gantt(...)` construction, config mapping (`viewMode`, `barHeight`, `arrow_curve`, etc.), and teardown — where §2.3's fix lands. |
| Dependency mutation & menu | `getDependencyTasks`, `clearDependencies`, the "Add dependency"/"Clear dependencies" context-menu items — where §2.2's editor's write-back logic lands, alongside the existing menu actions. |
| Task data mapping | Reading start/end/progress/dependencies/colorBy frontmatter into Frappe Gantt's task shape, including the keyword-based auto-detection fallback (`findByKeywords`). |
| WBS sidebar | The parent-note/WBS tree sidebar, shown when `showWbsSidebar` is enabled. |
| Note-from-template creation | The "create note" flow via `NoteTemplateService` — extract the seam but do not change its behavior (owned by `docs/specs/note-template.md`). |
| Options schema | `getGanttViewOptions` (~20 property/dropdown/toggle definitions across Properties/Display/Note template groups). |
| View lifecycle and commands | `onload`/`onDataUpdated`/`onunload`, plus the Gantt-specific command-palette commands (`gantt-scroll-today`, `gantt-view-*`) currently built in `src/main.ts`. |

## 6. Verification policy

1. Characterization tests before extraction.
2. Extract one concern at a time; `pnpm run check` after each step.
3. §2.2's dependency editor ships with tests covering: drag-to-create, drag-to-repoint,
   drag-to-remove, and that each writes the same property shape the existing context-menu actions
   already produce (no format drift between the two entry points).
4. §2.3's fix (whichever option is chosen) ships with a test that proves the leak is gone (or,
   for option 4, a comment documenting the quantified, accepted bound — not a bare assertion).

## 7. Definition of done

1. `src/views/BasesGanttView.ts` is reduced to a slim view class; the concerns in §5 live in
   separate, individually testable modules.
2. Interactive dependency-line editing (§2.2) works via drag and stays in sync with the existing
   context-menu actions, with regression tests and a native acceptance note.
3. The Frappe Gantt listener leak (§2.3) is resolved or its impact is concretely bounded and
   documented — not left as an unquantified "known limitation" past this workstream.
4. `pnpm run check` passes; no behavior regression is found in native testing of Gantt's existing
   feature set (bar drag/resize, WBS sidebar, view-mode switching, progress display).
5. `ROADMAP.md`'s Gantt row is updated to **Done (native-accepted YYYY-MM-DD)**.

## 8. Freeze and follow-ups from Gantt (2026-09-19)

The maintainer froze this workstream in favor of Gantt
([gantt.md](gantt.md), view id `wise-view-gantt-beta` at the time, now `wise-view-gantt`, built on
`@jaeungkim/gantt-chart`). Frappe Gantt stays registered and receives bug fixes only until
Gantt passes its stability gate (gantt.md §11), after which a separate removal
workstream deletes it.

- GAN-002 (module extraction), GAN-003/GAN-004 (listener leak), and GAN-006 (native acceptance)
  are deferred. If the removal workstream is approved they are cancelled, not resumed.
- GAN-005 (drag dependency editor) is superseded: Gantt draws and deletes dependencies
  natively.
- The listener leak in §2.3 remains the accepted, unquantified state until removal.

### Follow-ups caused by Gantt

Record here any change in a shared module that affects Frappe Gantt (gantt.md §6).

- **Dependency types.** Gantt stores SS/FF/SF links in separate, user-chosen properties.
  Frappe Gantt only reads its "Dependencies" property (FS). A note edited in Gantt may
  therefore show fewer arrows in Frappe Gantt. No change planned for Frappe.
- **Phase dates.** Frappe Gantt shows a parent note's own start/end. Unless Gantt's "Write
  phase dates" option is on, those can differ from Gantt's rolled-up summary dates.
- **Order property.** Gantt may write an Order property. Frappe Gantt ignores it and
  keeps following the Bases sort.
- **GBETA-016 review.** Shared modules touched by Gantt (`src/core/gantt/dependencies.ts`,
  `NoteTemplateService.prepareNote`, `LegacyMutationGateway.setDependencies`) changed only additively
  for Frappe: the one helper Frappe imports (`toGanttWikiLink`) is unchanged. Gantt's
  `wikiLinkText` heals damaged wikilinks; Frappe's own `ganttUtils.ts` still re-wraps link targets and
  can grow `[[[[Note]]` the same way. Not fixed here because the workstream is frozen.
