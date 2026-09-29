# Spec: Remove Frappe Gantt and make Gantt the only Gantt view

Status: Approved 2026-09-20 (maintainer decision recorded in [gantt.md §11](gantt.md))
Historical note: the 2026-09-29 Unimian rebrand renamed the current Bases view id to
`unimian-gantt`. This record preserves the identifier and migration assumptions in effect when this
workstream was completed; existing `.base` files using `wise-view-gantt` need a manual type update.
Baseline branch: `dev`
Prepared: 2026-09-20
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Plan: [../../tasks/gantt-frappe-removal/plan.md](../../tasks/gantt-frappe-removal/plan.md)
Tasks: [../../tasks/gantt-frappe-removal/todo.md](../../tasks/gantt-frappe-removal/todo.md)

## 1. Objective

Delete the Frappe-based Gantt view (`wise-view-gantt`) and everything that exists only for it, and
present the `@jaeungkim/gantt-chart` view under the name **Gantt** and the id `wise-view-gantt` (amended 2026-09-21, R6). After
this workstream the plugin has one Gantt view, one Gantt dependency, and no Frappe code, CSS, settings,
commands, notices, or docs.

## 2. Decisions (2026-09-20)

| # | Topic | Decision |
|---|---|---|
| R1 | Timing | Remove now, in this workstream, on `dev`. Nothing here has shipped to users from `dev`, so no deprecation release. |
| R2 | Display name | The new view's display name becomes **Gantt** (registration name and hover source). The id was first kept as `wise-view-gantt-beta`; R6 replaces that. The source folder stays `src/views/gantt/`. |
| R3 | Existing `.base` files | Originally: hard removal, so a `wise-view-gantt` base showed an unknown view. **Superseded by R6:** the id `wise-view-gantt` is reused, so those bases open in Gantt with their settings imported. |
| R4 | Commands and settings | Frappe's command-palette commands (`gantt-scroll-today`, `gantt-create-note`, `gantt-view-*`) and the "Gantt defaults" settings section are removed with it. Gantt does not carry them over (gantt.md D6). Saved `ganttDefaults` data is ignored on load, then dropped on the next save. |
| R6 | Permanent id and keys | **2026-09-21.** The permanent id is `wise-view-gantt` and every stored option key drops the `Beta` prefix (`ganttStart`, ...). `wise-view-gantt-beta` was never released and is not registered. Settings saved by the released Frappe view and by development builds are imported once (gantt.md §3.8), with Read only as the default so a legacy base cannot write until the user opts in. |
| R7 | One name everywhere | **2026-09-21.** Internal names match the public one, so a maintainer never has to map "beta" to "Gantt". `src/views/gantt-beta/` is `src/views/gantt/`, `BasesGanttBetaView` is `BasesGanttView`, identifiers drop `Beta`, tests are `tests/gantt-*.test.ts`, the specification and tasks are `docs/specs/gantt.md` and `tasks/gantt/` (the Frappe history moved to `gantt-frappe.md` and `tasks/gantt-frappe/`), and CSS classes use the `wise-view-gantt-*` namespace (the library already owns `gantt-*`, including `gantt-detail`). Task ids keep the `GBETA-` prefix. What still says "beta" is deliberate: the legacy import of `ganttBeta*` keys, and prose about the never-released `wise-view-gantt-beta` id. |
| R5 | Attribution | `frappe-gantt` leaves the bundle, so its notice and banner entry go. The `obsidian-bases-gantt` attribution stays until a maintainer review confirms no adapted code remains (§5). |

## 3. Scope

### 3.1 Delete

- `src/views/BasesGanttView.ts`, `src/utils/ganttUtils.ts`, `src/types/frappe-gantt.d.ts`
- `src/styles/views/gantt.css` and its entry in `FIRST_PARTY_CSS`
- `tests/gantt-view.test.ts`, `tests/fixtures/gantt.ts`, and the Frappe rows in `tests/view-registry.test.ts`
- The `frappe-gantt` dependency in `package.json` and the lockfile
- `scopeFrappeGanttCss` and the Frappe stylesheet entry in `esbuild.config.mjs`
- The `GanttDefaults` type, its default values, and the "Gantt" section of the settings tab
- The Frappe registration, hover source, and `buildGanttCommands` in `src/main.ts`
- The Frappe entries in `scripts/license-banner.mjs`, `THIRD_PARTY_NOTICES.md`, and the provenance
  ledger (the "known limitation" about the leaked listener goes with the library)
- `docs/gantt-view-improvement-prompt.md`

### 3.2 Change

- Rename the display name and user-facing strings "Gantt" to "Gantt" (view name, hover source,
  Notice texts, spec and README wording). Keep the ID, folder, class names, and option keys.
- `tests/architecture.test.ts`: drop `BasesGanttView.ts` from the legacy mutation allowlist; assert
  `frappe-gantt` is not a dependency.
- `docs/specs/gantt-frappe.md` and `tasks/gantt-frappe/*` (moved from `gantt.md` and `tasks/gantt/`): status "Superseded — removed by gantt-frappe-removal",
  kept as history.
- README: describe the single Gantt view, list the breaking changes, and explain how to move an old
  base (§4).

### 3.3 Keep

- Every Gantt behavior, option key, and test. This workstream removes code; it adds none except
  the rename.
- Calendar, Swimlane, Timeline, and shared platform code, unless a file is only used by the Frappe view.
  Anything shared is checked with a reference search before deletion.

## 4. Migration note for users (README and release notes)

1. Nothing to do for the view type: a base saved with `wise-view-gantt` opens in Gantt.
2. Its Frappe-era settings are imported on first open (start, end, label, dependencies, parent, progress, color by, view mode, task list, template and folder, and the schedule policy), and a Notice says so.
3. The chart is **read-only** until you turn off **Read only** in the view options. The old view wrote on drag; Gantt asks first.
4. Not carried over: expected progress, bar height, Hour / Quarter day / Half day scales (imported as Day), the right-click menu, the WBS sidebar (replaced by the task list and phases), and the Gantt command-palette commands.
5. Dependencies stay in the same property. The old view wrote them as comma-separated links; Gantt writes lists and reads both.
6. A development-build base saved with `type: wise-view-gantt-beta` needs its type changed to `wise-view-gantt`.

## 5. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A shared helper is deleted while something else imports it | High | Reference search before each deletion; typecheck and the full test suite after each phase |
| `obsidian-bases-gantt` attribution dropped while adapted code remains | High (license) | Keep the entry; remove only after a maintainer review of `src/main.ts` and remaining files (GFR-005) |
| Users with existing Frappe bases lose the view | Medium | Accepted (R3); README and release notes carry the migration steps |
| Mobile, popout window, and keyboard were not natively verified before the switch | Medium | Waived by the maintainer on 2026-09-20 (gantt.md §11); tracked as follow-ups, checked before the next release |
| Bundle and stylesheet shrink hides a missing rule | Low | Compare `main.js` and `styles.css` sizes before and after; Gantt has its own CSS file |

### Attribution decision (GFR-005, 2026-09-20)

**Keep** the `obsidian-bases-gantt` notice. `src/main.ts` still carries its "portions adapted" header,
and a reference search cannot prove that no adapted fragment remains after the Gantt view files were deleted.
The notice's file list was corrected to what remains. Dropping it is a licensing call for the maintainer
after reading `src/main.ts` against the upstream file; until then the conservative default stands.

## 6. Verification policy

1. After each phase: `pnpm run check`.
2. After the last phase: `pnpm run build && pnpm run verify:artifacts`, plus a repository search that
   finds no `frappe`, `BasesGanttView`, `ganttUtils`, `GanttDefaults`, or `bases-gantt-view` outside
   history, provenance notes, and this spec.
3. Record bundle and stylesheet sizes before and after.

## 7. Definition of done

1. Nothing listed in §3.1 exists, and no code imports it.
2. The view is named **Gantt**; its ID is unchanged.
3. `pnpm run check`, the production build, and `verify:artifacts` pass; the leftover search is clean.
4. README carries the migration note and breaking changes.
5. `ROADMAP.md` marks Gantt as Done and the old Gantt workstream as Superseded.
