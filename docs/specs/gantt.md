# Spec: Gantt — a phase-aware Gantt view built on `@jaeungkim/gantt-chart`

Formerly named "Gantt Beta"; the task ids below keep the `GBETA-` prefix from that time, because commits and reviews refer to them.

Status: Accepted 2026-09-20 — replaces Frappe Gantt (see §11); removal tracked in gantt-frappe-removal.md
Baseline branch: `dev`
Prepared: 2026-09-19
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Plan: [../../tasks/gantt/plan.md](../../tasks/gantt/plan.md)
Tasks: [../../tasks/gantt/todo.md](../../tasks/gantt/todo.md)
Related: [gantt-frappe.md](gantt-frappe.md) (Frappe Gantt workstream, frozen by this spec — see §9)
Decision record: [../architecture/view-write-access.md](../architecture/view-write-access.md)

## 1. Objective

Add a second, independent Gantt view — **Gantt** — rendered by
[`@jaeungkim/gantt-chart`](https://github.com/jaeungkim/gantt-chart) (MIT) instead of Frappe Gantt.
Gantt exposes the library's full interaction set (move, resize, progress, dependency drawing
and deletion, phases with roll-up and collapse, row reordering, drawing a range to create a note,
working calendar, detail panel), is configured entirely through Bases view options, and writes
every committed edit back to note properties.

Frappe Gantt (`wise-view-gantt`) stays registered and untouched while Gantt matures. When
Gantt meets the stability gate (§11), a separate workstream removes Frappe Gantt entirely.

## 2. Decisions from the 2026-09-19 interview

| # | Topic | Decision |
|---|---|---|
| D1 | UI runtime | `preact/compat`, aliased for `react`, `react-dom`, and `react/jsx-runtime` at build time. `react`/`react-dom` stay forbidden in `package.json` (architecture guard unchanged). A spike proves compatibility before any other work (plan Phase 0). |
| D2 | Write access | Approved: Gantt may write, **only** through `src/platform/mutations` capabilities, never by calling `processFrontMatter`/`vault.modify` from `src/views/gantt/`. Recorded as a precedent with plugin-compatibility consequences in [view-write-access.md](../architecture/view-write-access.md). |
| D3 | View ID | **Amended 2026-09-21.** The permanent id is `wise-view-gantt`, and stored option keys use the plain `gantt*` prefix (`ganttStart`, `ganttScale`, ...). The earlier decision (`wise-view-gantt-beta`, never released) was dropped because a permanent id and permanent option keys must not say "beta". Because `wise-view-gantt` was released for the Frappe view (1.0.2, 1.0.3), a base saved by that release opens in this view; its settings, and those of development builds (`ganttBeta*`), are imported once (§3.8). The id never changes again. |
| D4 | Phases | A phase is a **parent note** referenced by the configured Parent property, **and** each Bases `Group by` group becomes a synthetic, read-only phase row. |
| D5 | Dependency UX | One Bases-configured **Depends on** list-of-links property. Every stored edge is finish-to-start (FS). Users create/delete it through the line on the chart or the relation property; FS/SS/FF/SF codes are not exposed in the primary UX. |
| D6 | Schedule response | A three-state **When predecessor moves** policy: do not shift; shift only to resolve overlap; or shift by the same delta and maintain the gap. Every automatic move preserves successor duration and is cycle-safe. |
| D7 | Date storage | Local, floating values: `Date` properties as `YYYY-MM-DD` (end date **inclusive**), `Date & time` properties as `YYYY-MM-DDTHH:mm` with no offset. ISO strings with `Z`/offset are converted for display to the runtime local timezone but never produced. When configured values carry a zone, the detail UI identifies the runtime context (for example `Local time · Asia/Jakarta`); it does not imply that the stored offset was preserved. A future zoned-write mode requires a separate plugin-compatibility decision. |
| D8 | Obsidian integration | Click opens the note (modifier = new tab, per existing navigation helpers) and Ctrl/Cmd-hover shows Page Preview. |
| D9 | Detail panel | Custom Obsidian renderer (`renderDetail`), not the library's built-in body. |
| D10 | Reordering and creation | All three enabled: drag a row to another phase (writes Parent), drag to reorder within a phase (writes an Order property), and draw a range to create a note from the template. |
| D11 | Frappe workstream | Frozen: bug fixes only. GAN-002–GAN-005 deferred (§9). |
| D12 | Stability gate | Checklist + native acceptance on desktop and mobile + no data-loss bug + explicit maintainer decision (§11). |

## 3. Scope

### 3.1 View registration

- New descriptor in the `ViewRegistry`: id `wise-view-gantt`, name `Gantt`, its own
  icon, options, and hover source (`{ display: 'Gantt', defaultMod: true }`).
- Code lives in `src/views/gantt/`. Pure mapping/scheduling logic lives in
  `src/core/gantt/` (no `obsidian` import — existing core guard).
- The descriptor declares a new, explicit write capability (see D2) instead of
  `legacyMutation`.

### 3.2 Data model mapping (Bases → library `Task`)

| `Task` field | Source | Rule |
|---|---|---|
| `id` | Entry file path | Never stored in frontmatter. Synthetic phase rows use a reserved prefix that cannot collide with a vault path. |
| `name` | Label property, else file basename | |
| `startDate` / `endDate` | Start/End properties | `Date` → `YYYY-MM-DD`; the end date is converted from inclusive (property) to exclusive (library) by adding one day on read. `Date & time` → passed as floating wall-clock time (treated as UTC by the library). Values with an offset/`Z` are converted to local wall-clock time first. Missing end → one day (date) or one scale step (datetime). Missing start → entry is not placed (listed in the empty/unscheduled state). |
| `progress` | Progress property | Parsed as a number (numeric strings accepted), clamped 0–100. Omitted when unset or when "Show progress" is off. |
| `color` | Color-by property via the existing `ColorResolver` | |
| `parentId` | Parent property (link) resolved to a path, or the synthetic group phase id | See §3.3. |
| `sequence` | Computed, never stored | Depth-first numbering of the phase tree (`1`, `1.1`, `1.2`, `2`, …). Sibling order = Order property ascending when configured, else Bases sort order. |
| `dependencies` | Depends on property | Each resolved predecessor link becomes `{ targetId: path, type: 'FS' }`. Unresolved links remain untouched in frontmatter and are not drawn. The type is an adapter detail, not user-authored data. |
| `readOnly` / `allow*` | Synthetic rows; formula-backed properties | Synthetic phase rows are read-only. A task whose date property is a formula has `allowMove`/`allowResize` off. |

### 3.3 Phases (D4)

1. **Parent-note phases.** A task whose Parent property links to another entry in the Base's
   results gets that entry as `parentId`. With the Phases option on, the library's `hierarchy`
   renders the parent as a summary row with roll-up dates/progress and a collapse control.
   Nesting depth is unlimited; cycles and self-links fall back to root (library behavior),
   and Gantt shows a one-time Notice naming the offending notes.
2. **Parent note outside the results.** When the Parent link resolves to a file that is not in
   the Base's results (filtered out, or not a task), Gantt inserts a synthetic, read-only
   phase row named after that note. Clicking it opens the note. If the link does not resolve to
   any file, the task becomes a root row.
3. **Bases group phases.** When the Base has `Group by`, each group becomes a synthetic,
   read-only top-level phase row labelled with the group value (empty key → "No value").
   Parent-note phases nest inside their group. A task and its parent note in different groups
   are drawn under the task's own group, and the parent link is not honoured there (documented
   limitation; each group is its own tree).
4. **Phase dates.** Summary rows always display rolled-up dates. The "Write phase dates" option
   (default off) also writes the rolled-up start/end to parent-note phases after any change to
   their subtree, so other views (including Frappe Gantt) see matching dates.

### 3.4 Write-back

All writes go through the mutation capabilities (D2). `onTasksChange` delivers the whole array
with no description of what changed, so Gantt diffs it against the array it last passed in
and writes only changed fields of changed notes.

| Gesture | Library callback | Properties written |
|---|---|---|
| Move / resize / keyboard date edit | `onTasksChange` | Start/End (formatted per D7, inclusive end restored for `Date`) |
| Progress drag / keyboard | `onTasksChange` | Progress (integer) |
| Summary (phase) bar drag | `onTasksChange` | Start/End of every moved descendant; phase dates only if "Write phase dates" is on |
| Draw a dependency | `onDependencyCreate` → `onTasksChange` | A finish-to-start line from predecessor end to successor start appends `[[predecessor]]` to Depends on in the successor note. Other endpoint combinations are rejected in v1. |
| Enter or drag a reversed range | Before any mutation | Reject the change, restore the last valid chart state, and show a notice. Date & time permits an equal start/end as a zero-duration milestone; Date requires its inclusive End to be on or after Start. |
| Delete a dependency | `onDependencyDelete` → `onTasksChange` | Removes `[[predecessor]]` from Depends on in the successor note. |
| Drag row to another phase | `onTaskMove` → `onTasksChange` | Parent (link to the new parent note, or cleared at root). Dropping into a synthetic group phase is rejected with a Notice in v1. |
| Drag row within a phase | `onTaskMove` → `onTasksChange` | Order on the moved sibling set. Rejected with a Notice when no Order property is configured. |

Date gestures always snap to whole calendar days. Date & time gestures preserve the original
wall-clock time and duration on a move, with snapping controlled by the visible resolution:

| Picker | Persisted scale key | Date & time snap |
| --- | --- | --- |
| Hours | `day` | Hour/minute movement from the chart |
| Days | `week` | Whole days |
| Weeks | `month` | Whole seven-day weeks |
| Months | `quarter` | Calendar months |
| Quarters | `year` | Three calendar months |

Snapping happens before range validation and dependency cascade. Therefore schedule policies
operate on the same final dates that are persisted. If a gesture rounds back to the existing
boundary, the chart is repainted from that valid baseline without writing frontmatter.
| Draw a range / Add task | `onTaskCreate` | New note from the template (`NoteTemplateService.prepareNote`, then the `fileCreate` grant) with Start/End prefilled. Parent is not prefilled: the library's draft carries only the dates, not the row it was drawn on. |
| Detail panel field edit | `onTasksChange` or direct | Same as the equivalent gesture |

Rules:

- **Link format.** Written links use the same wiki-link form the Frappe view already writes
  (`toWikiLink`). Existing list/comma shapes are
  preserved (append/remove within the shape the property already has).
- **Failure.** A failed write shows a Notice and remounts the chart from the previous array. A
  plain re-pass cannot work: the library ignores a `tasks` prop whose contents equal the last one
  it received, and this host never passed the failed edit back in. The remount resets scroll,
  collapse, and selection, which is paid only on failure. Gestures queued behind the failed one
  are dropped, since their arrays still contain the failed edit. Writes for one gesture run in
  parallel, so a partial failure can leave some notes written; the next Bases update shows the
  true state.
- **Batching.** One gesture may touch many notes (summary drag, cascade). Gestures are applied
  strictly in order, each diffed against the previous result. Bases updates arriving while a
  write is in flight, or within 350 ms after it (3 s cap), are held and replaced by a single render
  from the latest data (`EchoGate`; `RenderScheduler` decides only skip/css-only/full and cannot
  coalesce over time).
- **Summary normalization.** A phase range is derived again, bottom-up, from its normalized direct
  children before the batch is validated. The chart library can report a clamped sub-day phase
  boundary while an Hours gesture is in progress; that intermediate range is never validated or
  persisted as an independent Date edit.
- **Echo suppression.** The re-render that Bases triggers after our own write must not reset
  scroll, selection, collapse state, or the open detail panel.
- **Order values.** Reordering renumbers the affected siblings with gaps (10, 20, 30, …) and only
  writes notes whose value changed.
- **Detail edits.** The custom detail panel calls the chart's `update` function, so Start, End,
  Duration, Progress, and dependency removal reach the same task-array diff and capability batch
  as gestures. Exact date fields and Duration bypass gesture-scale snapping but retain range
  validation and dependency scheduling. When a task has a Date & time Start but a Date-only End,
  editing End or Duration promotes End to Date & time before writing. This preserves the visible
  sub-day boundary instead of silently truncating it to midnight in frontmatter.

### 3.5 Dependency schedule policy (D6)

Depends on is a descriptive graph in every mode. The **When predecessor moves** option determines
whether Wise View is also authorized to write downstream dates:

1. **Do not shift automatically** (default): keep every successor date unchanged; the line makes
   the consequence visible without silently changing data.
2. **Shift only when dates overlap:** if successor B starts before predecessor A finishes, shift B
   forward by the minimum delta needed to restore the FS boundary. Existing positive gaps may
   shrink, matching Notion's "Shift only when dates overlap" behavior.
3. **Shift and maintain time between tasks:** when A moves by Δ, shift B by the same Δ so their
   existing gap is retained, matching Notion's "Shift & maintain time between items" behavior.

Every automatic shift preserves B's duration, cascades recursively, and visits each task once per
gesture (cycle-safe). Completed/progress state does not change the date rule in v1. If B is reached
by several predecessors, the latest required start wins. The policy is calculated in
`src/core/gantt/` so it can be unit-tested without Obsidian.

FS/SS/FF/SF remain useful scheduling vocabulary and may inform a future critical-path analysis,
but they are not four manual properties in Gantt v1. Critical path, slack, and violated-edge
indicators are derived/descriptive outputs from the dependency graph and dates; they must not add
frontmatter merely to explain the visualization.

### 3.5.1 Derived blocking (no extra property)

"Blocks" is Depends on read from the other side: if B depends on A, A blocks B. It is computed from
the dependency graph every time and never stored, so there is no second property to drift out of
sync (see the derived-output rule in §3.5).

| Derived state | Rule (finish-to-start only) | Shown as |
|---|---|---|
| Blocks | Tasks whose Depends on contains this task | "Blocks" section in the detail panel, each entry opens its note |
| Blocked | A predecessor has progress below 100 (unset counts as 0). Needs a Progress property; without one completion is unknown and the state is not shown | Faded bar and a grey edge on the list row; "Waiting on N unfinished predecessors" in the detail panel |
| Date conflict | A predecessor ends after this task starts (ends are exclusive, so touching is fine) | Red outline on the bar and a red edge on the list row; "Starts before N predecessors finish" in the detail panel |

The detail panel's Depends on list shows note names and opens the note on click. "Finished" means
progress 100 in v1; a status-property definition is deferred (§12).

### 3.6 Bases view options

Keys are Gantt's own; none are shared with the Frappe view's config so the two views never
fight over a `.base` file.

- **Properties:** Start date, End date, Label, Parent (phase), Order, Progress, Color by,
  Depends on.
- **Timeline:** Scale keys remain day/week/month/quarter/year, while the visible picker names
  their actual resolution Hours/Days/Weeks/Months/Quarters; the key is also persisted when changed on the chart.
  Show non-working days, Working weekdays (multitext, default Mon–Fri), Holidays (multitext of
  `YYYY-MM-DD`), Snap to working days, First day of week, Zoom with Ctrl/Cmd + wheel,
  Infinite scroll, Scroll to today on open.
- **Layout:** Phases (hierarchy), Task list, Row numbers, Detail panel, Show progress,
  Tooltip, Row height (CSS-only option via `ViewOptionSchema`).
- **Editing:** Read only, Move bars, Resize bars, Edit progress, Draw dependencies, Delete
  dependencies, Reorder rows, Create by drawing, When predecessor moves (do not shift / shift
  only on overlap / shift and maintain time), Write phase dates.
- **Note template:** Template note, Target folder, Title format (same semantics as today).
- **Persisted UI state:** collapsed phase ids and the current scale are stored in the view
  config (`config.set`), not in plugin settings.

### 3.7 UI

- **Toolbar** (the library renders none): resolution picker, Today, Zoom to fit, Add task (when
  creation is enabled), collapse all / expand all. Built with Obsidian DOM helpers and
  `setIcon`, above the chart.
- **Today marker:** the library's UTC wall-clock marker is shifted by the owning runtime's local
  offset so it shares the same local-floating axis as Date & time properties.
- **Theme:** `theme` prop set from `body.theme-dark` (observed), and `--gantt-*` tokens mapped to
  Obsidian CSS variables in `src/styles/views/gantt.css`. The library stylesheet is merged
  through the existing CSS merge plugin without rewriting (it has no `:root` selectors).
- **Detail panel (D9):** note title (opens the note), start/end, progress, Depends on links
  (each removable), and the Base's visible properties (`config.getOrder()`)
  rendered read-only. Date/progress fields and Duration are editable and write back via §3.4.
  A mixed Date & time Start / Date-only End is shown and persisted with Date & time precision for
  End as soon as End or Duration is edited.
- **Click / hover (D8):** `onTaskClick` opens the note through the existing navigation helper
  (respecting modifiers); hover preview uses a delegated `mouseover` listener reading
  `data-task-id`, like the other views.
- **Locale:** `locale` from Obsidian's moment locale; `firstDayOfWeek` from the option.
- **Empty/unscheduled state:** when entries lack a start date, list them with a hint naming the
  configured property, as the Frappe view does.
- **Mobile:** library touch model (400 ms hold to drag); toolbar collapses to icons.

### 3.8 Importing settings saved by earlier versions (2026-09-21)

Bases stores a view's options in the `.base` file under the option keys, so keys are as permanent as the
id. Two earlier sources are imported once per view, by `src/views/gantt/legacyOptions.ts`:

| Source | Keys | Notes |
|---|---|---|
| Released Frappe Gantt (1.0.2, 1.0.3) | `startDate`, `endDate`, `label`, `dependencies`, `colorBy`, `progress`, `parentProp`, `viewMode`, `showWbsSidebar`, `showProgress`, `templatePath`, `targetFolder`, `titleFormat`, `persistDependencyDateChanges` | `viewMode` maps Day, Week, Month, Year to the same scale; the sub-day modes map to day. `persistDependencyDateChanges: true` becomes the "maintain gap" schedule policy. `barHeight`, `expectedProgress`, and `showExpectedProgress` have no equivalent and are not imported. |
| Development builds | `ganttBeta*` | Each key maps to its `gantt*` twin; `ganttBetaDependsOn` and `ganttBetaMoveDependencies` map to Depends on and the schedule policy. |

Rules: a key already set under its permanent name is never overwritten, the development-build name wins
over the Frappe name, the old keys stay in the file untouched, nothing is written for a view that has no
earlier settings, and a marker key (`ganttLegacyImported`) is written once so a value the user clears later
is not brought back. A Notice says how many settings were imported, and that the chart stays read-only
until **Read only** is turned off (read-only is the default, so a Frappe-era base cannot write until the
user opts in). A development-build base saved with `type: wise-view-gantt-beta` must change its type to
`wise-view-gantt`; that id was never released and is not registered.

## 4. Non-goals

- Changing or removing the Frappe Gantt view, its option keys, or its ID (frozen, §9).
- Expected progress, Hour/Quarter day/Half day scales, a context menu, and Gantt command-palette
  commands (D6). Recorded as follow-ups in §12, not planned.
- Moving rows into a synthetic Bases group phase (would require writing the group-by property,
  which may be a formula).
- Critical-path/slack calculation and advanced SS/FF/SF scheduling. These are descriptive
  follow-ups, not additional manual properties in v1.
- PDF/image export, resource/workload views, multi-select editing (not in the library).
- Localising the library's own built-in strings (English only upstream).
- Redesigning note creation — `docs/specs/note-template.md` owns that; Gantt calls the
  existing `NoteTemplateService` API as-is.

## 5. Constraints and known library limitations

| Limitation (v1.5.1) | Handling |
|---|---|
| React peer dependency | D1: `preact/compat` alias; pnpm `peerDependencyRules` for the missing React peer. |
| UTC-only layout | D7 floating-time adapter. UTC is an internal chart coordinate system, not the user's storage semantics, and must not appear in Date labels. The library places its today line, scroll-to-today, and "Add task" draft at the real instant, which sits `|UTC offset|` hours away from a floating local time. The today line is corrected with a CSS offset (`--gantt-local-today-offset`, exact at day and week scale, approximate at month and coarser). Scroll-to-today and the "Add task" draft are not corrected: between local midnight and the offset hours they land on the neighbouring day. Runtime local time is detected from the owning window (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Upstream request drafted in `tasks/gantt/upstream-issues.md`. |
| Exclusive end dates | Converted on read/write (§3.2). |
| Global `document` listeners and `document.body` cursor | Drags inside an Obsidian popout window may not work; not yet verified natively (GBETA-017). Gantt's own listeners are popout-safe (`ViewRuntime`); only the library's are not. Documented limitation for Beta; the upstream issue/PR to use the element's `ownerDocument` is drafted in `tasks/gantt/upstream-issues.md` and not yet opened. Never monkey-patched (existing guard). |
| Whole-array `onTasksChange` | Diffing (§3.4). |
| No context-menu/hover callbacks | Delegated listeners on `data-task-id`. |
| Library reports a typed dependency | The v1 adapter accepts only end-to-start/FS and persists one Depends on link (§3.4). |
| Fixed 28 px bar height | Only row height is configurable. |
| Progress fill is the bar color mixed 62% with black | Near-black bar colors get a fill indistinguishable from the bar (contrast 1.00). Gantt mixes toward the bar's own text color instead (white on dark bars, black on light ones) at 50%: minimum contrast 2.62 over 20 sample colors from black to white, against 1.00 before. Pure CSS, applies to bars with an explicit `color`. |
| Whole-Base cost | Measured 2026-09-20 (`tests/gantt-scale.test.ts`): 5000 notes map in 160 ms and a bar move does 60 ms of main-thread work (was 883 ms and 1190 ms before removing per-task linear scans and per-comparison collators). Chart rendering is virtualized by the library. |
| Links that name no note | Reported once per link with a Notice ("could not find N dependency links"); links to notes merely filtered out of the Base are not errors. |
| Formula-backed properties | A property that is a formula has no frontmatter field, so edits that need it (move, resize, progress, link, reorder, add task) are disabled up front instead of failing after the drag. |
| Missing template note | `NoteTemplateService` shows "Template note not found" and creates the note without a template body. |
| Start date and End date mapped to the same property | Every task silently collapses to a one-day bar; the note's real End property, if any, is never read, which reads as data corruption rather than a config mistake. Reported once per property with a Notice ("Start date and End date are both mapped to..."). Leaving End date unmapped is the supported way to get single-day tasks — it does not warn. |
| Single maintainer, fast release cadence | Exact version pin, provenance ledger entry, characterization tests around the adapter before any upgrade. |

## 6. Shared code policy

Gantt is the priority consumer of anything shared. New shared modules (Bases → task
mapping helpers, link/dependency parsing and writing, date floating/inclusive conversion,
cascade) are designed for Gantt's needs first. The frozen Frappe view keeps its own code;
if a shared change would affect Frappe Gantt (e.g. a helper it imports changes behavior), the
change is either kept backward compatible or the impact is recorded as a follow-up in
[gantt-frappe.md](gantt-frappe.md) §8 and `tasks/gantt-frappe/todo.md` rather than fixed in the Frappe view now.

## 7. Architecture guard changes

- Add `src/views/gantt/` to `GUARDED_MUTATION_DIRS`: no direct mutation calls there.
- Add a declared capability (e.g. `capabilities.propertyWrite`) to `ViewCapabilities`,
  granted to Gantt only, and a guard test asserting that only descriptors declaring it
  receive a mutation gateway.
- `FORBIDDEN_DEPENDENCIES` unchanged; add a test that the production bundle contains no
  `react-dom` code (the alias actually applied).

## 8. Verification policy

1. Phase 0 spike is a hard gate: nothing else starts until preact/compat compatibility is proven.
2. Pure logic (`src/core/gantt/`) is unit-tested first: mapping, sequence, phases, date
  conversion round-trips (date and datetime, inclusive end), dependency parsing/writing,
  diffing, and both authorized cascade policies.
3. The view is tested in happy-dom with the real library mounted through Preact: a simulated
   `onTasksChange`/`onDependencyCreate`/`onTaskMove`/`onTaskCreate` produces the expected
   mutation-capability calls (no real vault writes).
4. `pnpm run check` after every task; `pnpm run build && pnpm run verify:artifacts` after any
   dependency or CSS change.
5. Native acceptance on desktop and mobile before the stability gate.

## 9. Frappe Gantt workstream (frozen)

Per D11, `docs/specs/gantt-frappe.md` is frozen at GAN-001 (complete). GAN-002–GAN-005 are deferred;
Frappe Gantt receives bug fixes only. The listener leak (gantt-frappe.md §2.3) and the monolithic
`BasesGanttView.ts` remain as-is until the removal workstream deletes them. GAN-005 (a drag
dependency editor for Frappe) is superseded by Gantt's built-in link drawing.

## 10. Definition of done (Gantt workstream)

1. Gantt is registered as `wise-view-gantt` and every §3 behavior works, including all
   §3.4 write paths.
2. All options in §3.6 are exposed through Bases and persisted in the view config.
3. Writes happen only through mutation capabilities; guard tests from §7 pass.
4. `pnpm run check` and `pnpm run build && pnpm run verify:artifacts` pass;
   `THIRD_PARTY_NOTICES.md` and `docs/architecture/upstream-provenance.md` list
   `@jaeungkim/gantt-chart` (and its bundled `zustand`), `dayjs`, and `preact`'s compat use.
5. Native acceptance recorded in `tasks/gantt/native-acceptance.md`.
6. `ROADMAP.md`'s Gantt row is updated.

## 11. Stability gate (Beta → replaces Frappe)

Gantt may replace Frappe Gantt when all hold:

- §10 is met.
- Native acceptance passes on desktop **and** mobile, including popout-window behavior recorded
  (works, or accepted as a documented limitation).
- No open bug that loses or corrupts property data.
- The maintainer records an explicit decision in this spec.

Then a new workstream ("Gantt Frappe removal") is created with its own spec/plan/tasks: remove
`frappe-gantt`, `BasesGanttView.ts`, its CSS scoping in `esbuild.config.mjs`, its notices and
provenance entries, the `wise-view-gantt` registration, and document how users switch their
`.base` views (D3).

### Decision (2026-09-20)

The maintainer approved replacing Frappe Gantt. This is an explicit waiver, not a full pass of the gate:

- §10 is met, and no open bug loses or corrupts property data.
- Native acceptance passed on desktop for most flows (no issues found). Mobile and the popout window
  were **not** verified, and the gate's "works, or accepted as a documented limitation" is met only
  as an accepted, documented risk: the popout limitation is in §5, and mobile is unknown.
- Keyboard, console, holiday shading, and the new progress colors are also unverified. All of them
  are listed in `tasks/gantt/native-acceptance.md` and are to be checked before the next release.

The removal workstream is [gantt-frappe-removal.md](gantt-frappe-removal.md).

## 12. Follow-ups (not planned)

- A status-property definition of "finished" for the blocked state, instead of progress 100.
- "Ready to start" filter and critical-path highlighting built on the same derived graph.
- Expected progress on Gantt.
- Descriptive critical-path, slack, and violated-dependency analysis derived from the graph and
  dates; no additional user-authored relationship text.
- Advanced SS/FF/SF relationships only if a later design provides equally simple visual creation
  and lossless Bases-compatible persistence.
- Sub-day scales (requires upstream support for custom scales or a fork).
- Context menu and command-palette commands for Gantt.
- Moving rows between synthetic Bases group phases.
- Upstream: `ownerDocument`-aware listeners (popout windows), local-time today marker.
- Zoned datetime write compatibility with Calendar, Tasks/Dataview-style workflows, Templater,
  and other property-owning plugins. Until that work has its own decision, Gantt keeps the
  approved local-floating write contract and only explains the local display context in UI.

## 13. External UX references

- [Notion: Sub-items & dependencies](https://www.notion.com/help/tasks-and-dependencies) — one
  dependency relation plus three automatic date-shifting policies: overlap-only, maintain time,
  or never shift.
- [Notion: Dependencies in Timeline](https://www.notion.com/en-gb/help/guides/tasks-manageable-steps-sub-tasks-dependencies)
  — users draw a line between timeline items; the relation property is the stored representation.
- [Microsoft Project: Link tasks](https://support.microsoft.com/en-us/project/link-tasks-in-a-project)
  — FS is the default relationship; SS/FF/SF are advanced schedule models, and predecessor
  changes can affect downstream successors.
- [Microsoft Project: Scheduling behind the scenes](https://support.microsoft.com/en-us/project/how-project-schedules-tasks-behind-the-scenes)
  — dependency chains influence project finish and form the basis for critical-path analysis.
