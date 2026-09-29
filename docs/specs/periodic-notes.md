# Spec: Native periodic notes for Calendar

Status: Done 2026-09-21 (native-accepted with waivers) — [record](../../tasks/periodic-notes/native-acceptance.md)
Baseline branch: `dev`
Prepared: 2026-09-21
Roadmap: [../../ROADMAP.md](../../ROADMAP.md)
Sequencing: after `docs/specs/note-template.md` is Done, then back to Calendar. That spec owns how a
note's *content* is produced (Templater / core Templates); this one owns *where a note lives and
what it is called*. Both meet in one creation call, so the template mechanism lands first.

## 1. Objective

Give Calendar a native, self-contained periodic-notes system, so daily/weekly/monthly/quarterly/
yearly notes and new event notes resolve to the right folder and name without installing
obsidian-journal, Periodic Notes, or depending on the core Daily Notes settings. The path and
template conventions must be expressible in a way compatible with Notebook Navigator's, so a vault
already organized by it works without moving files.

## 2. Decisions already made (maintainer, 2026-09-21)

1. **No cross-day event splitting.** An event spanning several days is one note, stored in the
   periodic folder of its **start** day. `date_end` carries the end. No per-day copies and no
   `part_of` / link-to-previous-day property.
2. **Settings live on the Calendar view**, not globally. A vault can hold several time systems
   (for example a personal journal and a work journal); each Base's Calendar view configures its
   own. This replaces installing a journal plugin for multiple periodic systems.
3. **The periodic root is free.** It does not have to be inside, or equal to, the folder of the
   `.base` file.
4. **Standalone.** No reading of obsidian-journal, Periodic Notes, core Daily Notes, or Notebook
   Navigator settings, and no migration: nobody uses the current behavior yet.
5. **Templater-compatible.** Note content goes through the general mechanism from
   `docs/specs/note-template.md`; this spec adds no substitution engine of its own.

## 2b. Scope decisions added 2026-09-21 (maintainer)

6. **The daily-note flow belongs to Calendar, not to Note Template.** `note-template` covers only
   integration with Templater / core Templates for notes a view creates. Anything involving the
   *date of the note* (which folder, what name, what the date tokens in the template mean) is a
   Calendar concern, because Calendar is where the date exists. The daily-note flow has evolved
   into the periodic-notes flow and is owned here.
7. **(Withdrawn by decision 11.)** ~~Date tokens for a period template are applied by Calendar.~~ This was not a reversal of Note
   Template decision 3: `note-template.md` §3.2 already says Unimian's own tokens apply to
   values the view itself computed. The clicked date is such a value. Scope stays narrow: only
   date tokens of the period being created (`{{date:FORMAT}}`, `{{title}}`, weekday tokens for
   weekly notes, matching Notebook Navigator's), evaluated on the **start of the period**, and
   never touching Templater / core Templates syntax. Whether this runs before or after the engine
   is decided in PN-001.
8. **One `.base` is one journal.** A `.base` file's Calendar view carries its own periodic-notes
   configuration, including which template each period uses. Several journals are simply several
   `.base` files, each configured independently (modular). This replaces obsidian-journal's
   multi-journal support natively, with no journal list, slots, or switcher inside one view.
   Unlike Notebook Navigator, which fixes one pattern per note type for the whole vault, each
   Base sets its own.
9. **The clicked date is the note's date, always.** The path, the name, and the date tokens in the
   template are all resolved from the clicked (target) date, including dates in the future that
   have no note yet. With Templater this removes the "today" problem, because the file name
   carries the date and the template reads it (decision 11).

10. **ISO 8601 is the default and the preset.** Week: `GGGG`/`WW` (Monday start, week one holds
    4 January). Preset patterns, root supplied by the user: day `YYYY/YYYY-MM/YYYY-MM-DD`, week
    `GGGG/GGGG-[W]WW`, month `YYYY/YYYY-MM`, quarter `YYYY/YYYY-[Q]Q` (ISO 8601 has no quarter
    form; this is the common convention), year `YYYY`. Locale week tokens (`gggg`/`ww`) stay
    supported as a second option with a configurable first weekday. Calendar shows an example in
    each path field's placeholder; users can enter any vault-relative path, including a custom root.
    It does not read Notebook Navigator settings.
11. **Templater is the preferred engine.** It is already first in `detectTemplateEngine`. Decision
    7 is withdrawn: Unimian does not resolve date tokens in period templates; templates read the
    date from the file name (`tp.file.title`), as the maintainer's do. Core Templates users get the
    engine's own behavior (documented limitation: its `{{date}}` is today).
12. **Periodic notes are not drawn as events; they are linked.** A note that is the period note for
    its own start date is excluded from the event list (checked by resolving the path for that
    date, so no reverse pattern parsing is needed). Their links live in the calendar chrome:
    - **Week:** a week-number column at the left of the month grid (Google Calendar's layout,
      Obsidian styling), each number a link with a small existence dot below, as in the Obsidian
      Calendar plugin. FullCalendar 7 exposes `weekNumbers` and `navLinkWeekClick`.
    - **Month, year, quarter:** the toolbar title becomes `September 2026 (Q3)` with each part
      underlined as a link hint (the underline is the affordance, matching the maintainer's
      reference), opening or creating that period's note; an existence dot marks notes that exist.
    - **Day:** day number link plus dot (unchanged).
    - **Week, 3-day, and day views (added 2026-09-21):** the title leads with the periods of the
      range and follows with the month, year, and quarter of its middle day: week and 3-day read
      `W39 · September 2026 (Q3)`; the day view reads `Tue 22 · W39 · September 2026 (Q3)` with the
      day link first. A 3-day range resolves from its middle day (a range crossing a month is
      ambiguous; the middle day decides). List views keep FullCalendar's own title. When no part of
      a view's title is a configured period, FullCalendar's own title is shown unchanged.
14. **Unconfigured means no links.** A period with no path pattern set on the Base gets no link,
    no underline, no dot, and no created notes; the rest of the calendar is unchanged. There is no
    global fallback (decision 2).
15. **Who decides the folder.** Unimian only supplies the *initial* folder; whatever the template
    engine does afterwards wins, because it runs after creation.
    - **Event notes:** template move (`tp.file.move`, Templater folder templates) > the Base's
      `targetFolder` > the start day's daily folder > Obsidian's new-note folder.
    - **Period notes:** the path pattern is the source of truth, because Calendar finds the note
      by resolving that path (dot, hover, hiding it from events). If a template moves a period note
      elsewhere, Calendar opens the moved note and tells the user it will not be marked or reused
      there. Period templates should therefore not move the note.
    - Unverified: whether Templater's own folder-template setting also fires on a note created
      through its API, which could apply a template twice. Check in native acceptance (PN-006).
13. **24-hour clock.** Event times and time-grid slot labels use 24-hour format, never AM/PM.
    Done 2026-09-21 as a fixed default (no new option key); list view already read well.

## 2a. Findings after Note Template landed (2026-09-21)

- `processTemplateVariables` is already retired by `note-template`; `formatDate` remains but only
  knows `YYYY YY MMMM MMM MM M DDDD DDD DD D dddd ddd`. The resolver needs its own formatter for
  `gggg`, `ww`, `Q`, and `[...]` literals.
- Reuse, do not rewrite: `services/templateEngine.ts` (`detectTemplateEngine`, `ensureFolder`,
  `availablePath`, `createNoteFromTemplate`, the every-time notice when no engine is enabled).
- Notebook Navigator (checked against its README): five types with per-type folder pattern,
  filename pattern, and template; template tokens include `{{date:FORMAT}}` and `{{monday}}..
  {{sunday}}`, evaluated on the **start of the note's period**. Week numbering follows the
  configured locale (see the real settings below).
- **Design tension (partly resolved below):** Templater and core Templates evaluate `{{date}}` /
  `tp.date.now` against *today*, not the clicked date. Note Template decision 3 removed Wise
  View's own substitution, so a template using `{{date}}` would produce today's date in a note for
  another day. The maintainer's own templates avoid this by reading the file name; core-Templates
  users would still be affected. PN-001 decides whether decision 7 is still needed.

**Notebook Navigator's real settings** (read from the maintainer's `wisetime` vault, 2026-09-21;
calendar keys only, plus the files they point at):

| Type | Pattern | Template |
|---|---|---|
| Day | `YYYY/YYYY-MM/YYYY-MM-DD` | `templates/timeline/daily.md` |
| Week | `gggg/gggg-[W]ww` | `templates/timeline/weekly.md` |
| Month | `YYYY/YYYY-MM/YYYY-MM` | `templates/timeline/monthly.md` |
| Quarter | `YYYY/[Q]Q` | `templates/timeline/quarterly.md` |
| Year | `YYYY/YYYY` | `templates/timeline/yearly.md` |

Also: `calendarLocale: en-gb`, `calendarPeriodicNotesLocaleSource: calendar`. Real notes live at
`timeline/2025/2025-10/2025-10-05.md`. The patterns carry no `timeline/` root; that root appears
in the core `daily-notes.json` (`folder: "timeline"`), and where Notebook Navigator itself takes it
from is unverified.

Consequences for this spec:

- **One combined path pattern per period**, folder and file name in one string split by `/`
  (last segment is the file name), root included: `timeline/YYYY/YYYY-MM/YYYY-MM-DD`. Keeps
  Notebook Navigator's patterns copyable. Supersedes the "folder pattern + file-name pattern"
  wording in §3.1.
- **Weeks are locale-based** (`gggg`/`ww`, not ISO `GGGG`/`WW`). With `en-gb` (Monday start, week
  one contains 4 January) the two coincide, which is why the maintainer's weekly template can use
  `GGGG-[W]WW` against a `gggg-[W]ww` file name. The resolver takes a week-start day and a
  week-one rule as inputs.
- **The templates are Templater templates that derive their date from the file name**
  (`moment(tp.file.title, "YYYY-MM-DD")`), never from today. So for this workflow the "today"
  problem does not exist as long as Calendar names the file from the clicked date. Decision 7 (Wise
  View resolving date tokens) is therefore only needed for the core-Templates path and can be
  scoped down or deferred (PN-001).
- **Existing defect confirmed by this vault:** `daily-notes.json` points its template at
  `templates/daily.md`, which does not exist (the real one is `templates/timeline/daily.md`). The
  current daily-note flow reads that setting (when the core Daily Notes plugin is enabled, which
  was not checked), finds no template, and would create an empty note. The
  per-Base template setting removes the dependency on that stale file.
- Periodic notes in this vault carry `timeline_start` / `timeline_end` frontmatter and match the
  Base filter `file.folder.contains("timeline")`, so they also show up as events in the same
  Calendar. That is the maintainer's data model, not something this spec changes.

## 2c. PN-004p findings: what FullCalendar 7.1 allows (2026-09-21)

Checked by rendering a real `Calendar` (dayGrid + interaction) in the test DOM and reading its
types. Layout and styling were not visible there, so placement is confirmed natively in PN-004c/d.

- **Week links work.** `weekNumbers: true` plus `inlineWeekNumberContent(info)` renders one custom
  element per week row (six for September 2026). `info` carries `num`, `date`, `text`, and
  `hasNavLink`. With `navLinks: true`, a click on it calls `navLinkWeekClick(weekStart, event)`
  with the week's first day (Monday 31 Aug for week 36). Hooks `inlineWeekNumberClass` /
  `DidMount` exist for classes and the existence dot.
- **Use our own numbers.** The label must come from `weekInfo()` in the resolver, not `info.num`,
  so it always matches the file name the pattern produces (ISO or the locale rule).
- **Title parts need a custom toolbar element.** `toolbarElements: { name: () => ({ domNodes }) }`
  accepts a DOM node and `headerToolbar.center` can name it instead of `title`. The builtin title
  is then absent. The generator does not receive the date, so keep one persistent element and
  rewrite its spans from `datesSet` (fires with `view.title` on load and navigation).
- **Not verified:** where the week element sits visually (a column left of the grid or inside the
  row) and whether `weekNumberHeaderContent` renders a header cell. Both are styling questions for
  PN-004c, not blockers.
- **Decision:** proceed with PN-004c (week column) and PN-004d (custom title element). No
  fallback design is needed.

## 3. Scope

1. **Per-period configuration** on the Calendar view, for each of day, week, month, quarter, year:
   enabled flag, folder pattern, file-name pattern, template note. Persisted `.base` option keys
   are new and must avoid Bases-reserved view-config keys.
2. **Path patterns using moment-style tokens** (`YYYY`, `MM`, `DD`, `ddd`, `gggg`, `[W]ww`, `Q`,
   with `[...]` literals), so a folder pattern such as `Journal/YYYY/MM` and a name pattern such as
   `YYYY-MM-DD` can be set to match Notebook Navigator's layout. Tokens embedded in ordinary words
   are treated as literal text; bracket literals remain available for explicit escaping. Exact
   token table is fixed by PN-001.
3. **One resolver** `resolvePeriodicPath(date, period, config)` returning folder + name + full
   path. Pure, no `obsidian` import, unit-testable.
4. **Calendar integration:**
   - Clicking a day number, or a week/month/quarter/year header where such a link exists, opens
     or creates that period's note.
   - The journal dot and hover preview use the same resolver, for existing notes only.
   - A new event note goes to the resolved daily folder of its start date whenever the view's
     `targetFolder` option is empty. A non-empty `targetFolder` still wins.
5. **Creation** goes through the general mechanism from `note-template.md` with the period's
   template note. This spec never reads the template file or substitutes tokens itself.
6. **Retire** the obsidian-journal and core Daily Notes lookups in
   `src/views/calendar/dailyNote.ts`, and `processTemplateVariables`/`formatDate`, in favor of the
   resolver plus the general creation call.

## 4. Non-goals

- No support for reading another plugin's settings (see decision 4).
- No event splitting, no `part_of`, no sync between notes (decision 1).
- No recurrence, no task logic, no automatic creation of notes in advance
  (`AGENTS.md`: Unimian is a view enrichment plugin, not a task manager).
- No change to Gantt, Swimlane, or Timeline. Periodic notes are Calendar-only until another view
  asks for them.
- No global (plugin-level) periodic settings; per-view only (decision 2).

## 5. Open questions (resolved in PN-001 — see §2/§2b's decisions; kept below as the record of
what was asked)

- Week numbering: ISO weeks (`gggg-[W]ww`, Monday start) versus following the view's
  `weekStartsOn`. Notebook Navigator's own convention decides, and it must be read from its
  documentation, not assumed.
- Which periods does Calendar's UI actually link (day numbers only today; week/month headers
  only where FullCalendar exposes a nav link)? Enabling week/month/quarter/year notes may need
  new affordances, which is scope to confirm before building.
- What happens when a folder pattern resolves outside the vault or contains a path-traversal
  segment (`..`)? Proposed: reject and show a notice; PN-001 to confirm.
- Does the period-template date-token step (decision 7) run before Templater/core Templates or
  after? Before means the engine sees resolved dates; after would let the engine's own output be
  rewritten, which risks touching its syntax. Recommended: before, on the template text passed
  to a temporary copy, or as engine input if Templater exposes it. Verify against the engine
  APIs in `services/templateEngine.ts`.
- The exact Notebook Navigator defaults to match, and whether an example-only "preset" button is
  worth having.

## 6. Verification policy

1. The resolver has table-driven unit tests for every token and every period, including
   year/week boundaries (Dec 29–Jan 3), leap day, and a non-Monday week start.
2. Characterization before removal: today's daily-note behavior stays covered until the retirement
   task, then is replaced by resolver-based tests.
3. A test proves a multi-day event is created once, in the start day's folder, with no extra
   notes or links.
4. A test proves an unsafe pattern (`..`, absolute path) is rejected without creating anything.
5. Native acceptance in a vault laid out like Notebook Navigator's, and in a vault with no periodic
   settings (view must behave sensibly when unconfigured).
6. `tests/architecture.test.ts` still passes; any new mutation path is declared, not silently
   allowed.

## 7. Definition of done

1. Per-period settings exist on Calendar and persist in the `.base`.
2. `src/views/calendar/dailyNote.ts` no longer reads obsidian-journal or core Daily Notes, and no
   longer owns a substitution engine.
3. Existing periodic notes laid out per the configured patterns are found (dot, hover, open);
   missing ones are created through the general mechanism.
4. Events spanning days produce exactly one note.
5. `pnpm run check` passes.
6. `ROADMAP.md`'s Periodic Notes row is updated to **Done (native-accepted YYYY-MM-DD)**.
