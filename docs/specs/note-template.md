# Spec: General note-template creation (Templater / Obsidian Templates integration)

Status: Done 2026-09-21 (native-accepted with waivers) — [record](../../tasks/note-template/native-acceptance.md)
Baseline branch: `dev`
Prepared: 2026-09-19
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Sequencing: last — after `docs/specs/performance.md` and the four view workstreams (see
`ROADMAP.md`). Deliberately sequenced last because the fix is a general, all-views-level redesign;
implementing it before each view's own reorganization would mean rewriting the integration point
twice.

Hold released 2026-09-21: the maintainer chose to implement before Performance is Done and
recorded the decisions in §5. Native acceptance (§6.4) is still required before Done.

## 1. Objective

Replace Unimian's two duplicated, hand-rolled `{{...}}`-substitution engines with a single,
general note-creation path that actually integrates with Templater (when installed) or Obsidian's
core Templates plugin (as a fallback), implemented once at a level every view's note-creation
feature can use — not per-view.

## 2. The confirmed defect

**Symptom reported by the maintainer:** creating a note from Calendar's or Gantt's "Note
template" option does not run through Templater — the new note's name and body are the raw,
unprocessed template text.

**Root cause:** two independent substitution engines, neither of which invokes Templater or
Obsidian's core Templates plugin:

- `NoteTemplateService.renderTemplate()` ([src/services/NoteTemplateService.ts:202](../../src/services/NoteTemplateService.ts))
  — used by the "Note template" option's `templatePath`/`targetFolder`/`titleFormat` fields
  (Calendar's "add event" flow, Gantt's "create note" flow). Reads the template file's raw text
  with `vault.cachedRead`, applies its own `title`/`date`/`time`/`start`/`end` regex replacement,
  and either (a) calls `vault.create()` directly with the substituted text when `targetFolder` is
  set, bypassing any template-application plugin entirely, or (b) creates an empty file through
  `view.createFileForView()`, races a `vault.on('create', ...)` listener against whatever
  Templater/Obsidian's own folder-template auto-apply might do to that same new file, then
  unconditionally overwrites the file's frontmatter and body with its own regex-substituted text —
  silently clobbering anything Templater already wrote if Templater's listener resolved first.
- `processTemplateVariables()` (`src/views/calendar/dailyNote.ts`, retired here; the whole file was
  later removed by `docs/specs/periodic-notes.md` PN-005)
  — a second, differently-shaped substitution engine (adds `weekday`/`month` tokens), used only by
  `openDailyNote()`. Same problem: `vault.create()` with pre-substituted text, no Templater/Templates
  involvement.

Neither path gives Obsidian's own folder-template mechanism a real chance to run, because the file
is never left genuinely empty before being overwritten, and neither ever calls Templater's public
API (`app.plugins.plugins['templater-obsidian']`) or the core Templates plugin
(`app.internalPlugins.getPluginById('templates')`).

## 3. Scope

1. **Design one general note-creation path.** When Templater is installed and enabled, create the
   note through Templater's own "create note from template" API so its `<%* %>`/`<% %>` syntax,
   prompts, and cursor placement work exactly as they would from Templater's own command. When
   Templater is not installed, fall back to Obsidian's core Templates plugin's insertion behavior
   if enabled. Only as a last resort — with the fallback made explicit in the UI/documentation,
   not silent — keep something like today's plain-text-with-frontmatter-merge behavior.
2. **Scope Unimian's own `{{date}}`/`{{title}}`/etc. tokens correctly.** These should only ever
   apply to values the *view itself* computed (the clicked date, for the title-format field), and
   never act as a second, competing substitution engine against the template file's own body —
   that competition is the actual defect, not the existence of Unimian's own tokens.
3. **Implement it once, generally**, at a level both Calendar's event-creation flow, Gantt's
   create-note flow, and Calendar's daily-note flow can all call — retiring both
   `NoteTemplateService.renderTemplate()`'s and `processTemplateVariables()`'s duplicated
   substitution logic into that one implementation.
4. **Design for future views.** Any view added later that creates notes from a template should be
   able to use this same general mechanism without writing a third copy.

## 4. Non-goals

- No change to what template *fields* Calendar/Gantt expose in their own options (`templatePath`,
  `targetFolder`, `titleFormat`) unless the redesign specifically requires it — and if it does,
  that is a breaking-enough change to call out explicitly for maintainer sign-off, not slip in
  quietly.
- No bundling of Templater as a dependency — Unimian integrates with it when present, the same
  way it already treats Pretty Properties as an optional integration
  (`src/integrations/PrettyPropertiesAdapter.ts`), not a hard dependency.
- No redesign of daily-note handling beyond fixing its template-substitution path — its
  daily-notes-core-plugin-settings lookup (folder/format) is out of scope here.

## 5. Decisions (maintainer, 2026-09-21)

1. **No engine available → notice every time.** When neither Templater nor the core Templates
   plugin is enabled, the template is copied as-is and a notice says its `{{...}}` / `<% %>`
   syntax was not processed. No silent fallback, and no once-only suppression.
2. **Rewrite `NoteTemplateService` in place.** It stays the single entry point; the engine
   dispatch lives in `src/services/templateEngine.ts`. Scoped-write views (Gantt) pass
   `NoteCreationRequest.templatePath` and the mutation gateway dispatches to the same engine.
3. **Backward compatibility.** Unimian no longer substitutes `{{title|date|time|start|end}}`
   (Calendar/Gantt) or `{{weekday|month|date:FORMAT}}` (daily notes) inside template files. With
   Templater or core Templates enabled the plugin handles its own syntax (core Templates knows
   `{{title}}`, `{{date}}`, `{{time}}`); `{{start}}`/`{{end}}` in a template body are no longer
   filled — the view still writes the start/end frontmatter fields itself. Those tokens still work
   in the `titleFormat` option, and only there.
4. **Calendar notes with a template but no `targetFolder`** are created in Obsidian's new-note
   folder instead of through `createFileForView`, which was the source of the overwrite race.

5. **Scope boundary (maintainer, 2026-09-21).** Note Template covers only the Templater / core
   Templates integration for event and task notes (Calendar event creation, Gantt create-note).
   The daily-note flow is not owned here: it has evolved into Periodic Notes
   ([periodic-notes.md](periodic-notes.md)), a Calendar-view feature configured per view, where the
   clicked date exists. How that date reaches a template (Templater and core Templates evaluate
   `{{date}}` / `tp.date.now` against today) is PN-001's decision, not this workstream's. The
   interim edit in `calendar/dailyNote.ts` (route through `templateEngine.ts`, drop
   `processTemplateVariables`) stays only until Periodic Notes retires that module.

## 5a. Original open questions (answered above)

- When Templater is not installed and the core Templates plugin is also not enabled, should note
  creation fall back silently to today's plain-text behavior, or surface a one-time notice telling
  the user their `{{...}}`/`<% %>` template will go in unprocessed?
- Should the general mechanism live as a new shared service (replacing `NoteTemplateService`
  outright) or as a rewrite of `NoteTemplateService` in place? This affects whether Calendar's and
  Gantt's own workstreams (`docs/specs/calendar.md`, `docs/specs/gantt.md`) need to leave a
  specific extraction seam for it — flag this now so those two specs' extraction work aims at the
  right shape, even though the fix itself lands later.

## 6. Verification policy

1. A regression test proves Templater's own API is actually invoked when Templater is installed
   (a fixture/mock of the Templater plugin object, not just "no crash").
2. A regression test proves the core-Templates fallback path when Templater is absent.
3. A regression test proves the last-resort plain-text path is unchanged in shape (frontmatter
   merge, `{{...}}` tokens applied only to view-computed values) from today's behavior, minus the
   defect (no more overwrite-race, no more raw-copy of an unprocessed template).
4. Native acceptance: create a note through Templater from Calendar, from Gantt, and from
   Calendar's daily-note flow, with a real Templater-syntax template, and confirm it is processed
   correctly in all three cases.

## 7. Definition of done

1. `NoteTemplateService.renderTemplate()` and the extracted
   `calendar/dailyNote.processTemplateVariables()` are
   both retired in favor of one general implementation.
2. Templater and core-Templates integration both work per §6's native acceptance.
3. `pnpm run check` passes.
4. `ROADMAP.md`'s Note Template row is updated to **Done (native-accepted YYYY-MM-DD)**.
