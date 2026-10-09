# Tasks: Gantt code quality, dependency editing, and the listener leak

Plan: [plan.md](plan.md)
Specification: [../../docs/specs/gantt-frappe.md](../../docs/specs/gantt-frappe.md)

> **Superseded 2026-09-20: the Frappe Gantt view was removed** ([removal workstream](../gantt-frappe-removal/todo.md)); the tasks below are history and will not be resumed.
>
> **Frozen 2026-09-19.** Frappe Gantt receives bug fixes only while Gantt
> ([tasks/gantt/todo.md](../gantt/todo.md)) matures. GAN-002–GAN-006 are deferred;
> GAN-005 is superseded by Gantt. Follow-ups caused by Gantt are listed in
> [spec §8](../../docs/specs/gantt-frappe.md).

## Phase 1: Characterize current behavior

### GAN-001: Add characterization tests for task mapping, dependency mutation, WBS, and lifecycle

**Status:** Complete (2026-09-19)

**Description:** Extend or add tests covering task data mapping (including the keyword-detection
fallback), dependency mutation via the context menu (add/clear), the WBS sidebar, and the Frappe
Gantt lifecycle wrapper (construction/config mapping/teardown, including the current known
listener leak — characterize its presence, don't fix it here).

**Acceptance criteria:**

- [x] A test demonstrates the current listener leak exists (one `document`-level `mouseup`
  listener added per `new Gantt(...)` call, never removed) — this is the baseline GAN-004 fixes
  against.
- [x] Dependency mutation tests assert on the exact property shape written (comma-separated vs.
  array, matching current behavior).

**Verification:** `pnpm run test -- gantt && pnpm run typecheck`

**Dependencies:** none.

**Likely files:** `tests/gantt-view.test.ts` (or wherever Gantt's existing tests live)

**Estimated scope:** L

**Verification record:** `pnpm run test -- gantt` (18 passed), `pnpm run typecheck`, and
`pnpm run check` (31 files / 305 tests passed) on 2026-09-19.

## Phase 2: Extract modules

### GAN-002: Extract task data mapping, the Frappe Gantt lifecycle wrapper, WBS sidebar, and options

**Status:** Deferred (frozen 2026-09-19)

**Description:** Move each concern in `docs/specs/gantt-frappe.md` §5's table into its own module under
`src/views/gantt/`. Leave the note-from-template seam extracted but behaviorally untouched.

**Acceptance criteria:**

- [ ] GAN-001's characterization tests pass unchanged against every extracted module.
- [ ] `src/views/BasesGanttView.ts` is reduced to a slim view class.

**Verification:** `pnpm run test -- gantt && pnpm run typecheck`

**Dependencies:** GAN-001.

**Likely files:** `src/views/gantt/*.ts`, `src/views/BasesGanttView.ts`

**Estimated scope:** L

## Phase 3: Frappe Gantt listener leak

### GAN-003: Investigate a version/API fix for the listener leak

**Status:** Deferred (frozen 2026-09-19)

**Description:** Check for a Frappe Gantt version newer than 1.2.2 that fixes the leak, and any
supported teardown/suppress option added since. Record findings in `docs/specs/gantt-frappe.md`.

**Acceptance criteria:**

- [ ] A written finding exists (version checked, changelog reviewed, teardown API present or
  absent) before GAN-004 picks an implementation path.

**Verification:** Documentation review; no code change required for this task itself.

**Dependencies:** GAN-002.

**Likely files:** `docs/specs/gantt-frappe.md`

**Estimated scope:** S

### GAN-004: Implement the chosen listener-leak resolution

**Status:** Deferred (frozen 2026-09-19)

**Description:** Implement whichever path GAN-003's findings and the maintainer's sign-off
selected: version upgrade, a supported suppress option, a vendored minimal patch (with SPDX
header and `THIRD_PARTY_NOTICES.md` entry), or a documented, quantified accepted bound.

**Acceptance criteria:**

- [ ] GAN-001's leak-demonstrating test now proves the leak is gone (or, for the accepted-bound
  outcome, is replaced by a test/comment documenting the quantified bound).
- [ ] `docs/architecture/upstream-provenance.md` reflects whichever direction was taken.

**Verification:** `pnpm run test -- gantt && pnpm run typecheck`; `pnpm run verify:artifacts` if a
new/patched dependency is bundled.

**Dependencies:** GAN-003.

**Likely files:** `src/views/gantt/ganttLifecycle.ts`, `docs/architecture/upstream-provenance.md`,
`THIRD_PARTY_NOTICES.md`

**Estimated scope:** M

## Phase 4: Interactive dependency-line editor

### GAN-005: Design and implement drag-to-create/repoint/remove dependency arrows

**Status:** Superseded by Gantt (2026-09-19)

**Description:** Build the interactive dependency editor per spec §2.2, writing to the existing
"Dependencies" property through the same code path the context-menu actions already use.

**Acceptance criteria:**

- [ ] Drag-to-create, drag-to-repoint, and drag-to-remove each produce the same property shape as
  the existing context-menu "Add dependency"/"Clear dependencies" actions.
- [ ] The existing context-menu actions are unchanged and still work alongside the new drag
  interaction.

**Verification:** `pnpm run test -- gantt-dependency-editor && pnpm run typecheck`

**Dependencies:** GAN-002, GAN-004 (informs whether a Frappe Gantt version/library change affects
the interaction approach).

**Likely files:** `src/views/gantt/dependencyEditor.ts`, `src/views/gantt/dependencyMutation.ts`

**Estimated scope:** L

## Phase 5: Native acceptance

### GAN-006: Native desktop/mobile smoke test

**Status:** Deferred (frozen 2026-09-19)

**Description:** Manually verify bar drag/resize, WBS sidebar, view-mode switching, progress
display, and the new dependency-line editor.

**Acceptance criteria:**

- [ ] No regression found versus pre-extraction behavior.
- [ ] The dependency editor works correctly alongside existing bar drag/resize gestures.
- [ ] Findings recorded (a short native-acceptance note).

**Verification:** Native testing; `pnpm run check`.

**Dependencies:** GAN-004, GAN-005.

**Likely files:** `tasks/gantt-frappe/native-acceptance.md` (new)

**Estimated scope:** S
