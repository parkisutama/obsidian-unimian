# Spec: Cross-view performance verification

Status: Phases 1-3 implemented (PERF-001–003) — Phase 4 native acceptance pending
Baseline branch: `dev`
Prepared: 2026-09-19
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Sequencing: after Swimlane, Calendar, Gantt, and Timeline's own workstreams are done (see
`ROADMAP.md`) — a performance fix should land in each view's settled module structure, not in a
file about to be reorganized.

## 1. Objective

For each of the four active views, confirm — with a test, not inspection alone — that large-Base
behavior is actually bounded, and fix any unbounded synchronous DOM construction or uncancelled
repeated work found. This is a verification-first spec: most items below may already be true; the
job is proving it, and only then fixing what isn't.

## 2. Scope

### 2.1 Bounded initial render

A large Base (a fixture on the order of this project's established 5,000-entry precedent, see
`tests/fixtures/large-base.ts` if it still exists from the prior program, or recreate it) must not
cause unbounded synchronous DOM construction on first render, for:

- **Swimlane**: card construction across all columns/swimlanes.
- **Calendar**: FullCalendar's own event rendering (verify FullCalendar's built-in virtualization
  is actually engaged for the configured view modes, not assumed).
- **Gantt**: the chart library virtualizes rows and time cells; Unimian's own mapping and write-back cost was measured and fixed in GBETA-016 (`tests/gantt-scale.test.ts`).
- **Timeline**: already has `VirtualLinearCollection`-based row virtualization from the prior
  program — confirm it still holds after Timeline's own workstream changes land, don't re-derive
  it.

### 2.2 Fast path for identical updates

Repeated identical `onDataUpdated()` calls should skip rebuilding unchanged DOM, the way
Timeline's `RenderScheduler` (`src/platform/dom/RenderScheduler.ts`) already does. For each of
Swimlane, Calendar, and Gantt: confirm an equivalent guard exists, or add one using the same
shared `RenderScheduler`/`computeRenderSignature` infrastructure Timeline already proved — do not
invent a second render-scheduling mechanism.

### 2.3 No accumulated work under repeated fast interaction

Drag/resize/scroll interactions must not accumulate uncancelled work across repeated fast
triggers:

- Swimlane's column/swimlane/card drag-and-drop.
- Gantt's bar drag/resize (and, if `docs/specs/gantt.md`'s dependency-line editor has landed by
  this point, its drag interaction too).
- Calendar's view-mode switching (year/month/week/day/list).

## 3. Non-goals

- No new virtualization framework or shared abstraction is introduced speculatively — reuse
  `RenderScheduler`/`VirtualLinearCollection` where they fit; if a view's needs genuinely don't
  fit either, that mismatch is itself a finding to record, not a reason to build a third
  abstraction preemptively.
- No performance work on a view type that doesn't exist yet (Grid, Masonry, Feed, Keep).
- No change to FullCalendar's or the Gantt chart library's bundled version purely for performance
  reasons. The Gantt library is pinned exactly and upgraded only through a dedicated task
  (docs/architecture/upstream-provenance.md).

## 4. Verification policy

1. Every claim in §2 ships with the fixture/test that demonstrates it — a comment asserting
   boundedness is not sufficient evidence.
2. Where a view already meets a bar, record that as a passing verification (a new or existing
   test proving it) rather than assuming it and moving on.
3. Where a view does not meet a bar, the fix ships with a before/after measurement (mounted node
   count, or timing, whichever the specific claim is about) in the test or its description.

## 5. Definition of done

1. Each of §2.1, §2.2, §2.3 has a passing, documented verification for all four views (or a
   recorded, justified exception).
2. Any fix required by a failed verification is implemented and covered by its own regression
   test.
3. `pnpm run check` passes.
4. `ROADMAP.md`'s Performance row is updated to **Done (native-accepted YYYY-MM-DD)**, unblocking
   `docs/specs/note-template.md`.
