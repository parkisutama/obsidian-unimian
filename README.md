# Unimian

> **A focused, task-management-agnostic view enrichment plugin for Obsidian Bases.**

Unimian adds Calendar, Swimlane, Gantt, and Timeline views directly into Obsidian Bases — without
any opinion about *how* you manage your tasks or which plugin you use for that. Your data model is
yours. This plugin just gives you richer ways to look at it.

---

## Origin & Attribution

This plugin is a **derivative work** of [Obsidian Planner](https://github.com/SawyerRensel/Planner)
by [Sawyer Rensel](https://github.com/SawyerRensel), which is licensed under the
**GNU General Public License v3.0**.

Because the original work uses GPL v3 — a *copyleft* license — this plugin **must also be distributed
under GPL v3**. See the [License](#license) section for details.

### What was changed from the original

The original Planner is a full-featured planning and task management plugin. Unimian intentionally
**narrows the scope**:

| Original (Planner) | Unimian |
| --- | --- |
| Task List view | ✗ Removed |
| Item Modal / Quick Capture | ✗ Removed |
| Natural language date parsing (chrono-node) | ✗ Removed |
| Recurrence engine (rrule) | ✗ Removed |
| Item hierarchy & blocking dependencies | ✗ Removed |
| Task management workflow & statuses | ✗ Removed |
| Calendar view | ✓ Kept |
| Kanban view | ✓ Kept, renamed **Swimlane** |
| Gantt view | Added (an earlier Frappe-based view was replaced) |

### Gantt code attribution

The Gantt view incorporates code adapted from
[obsidian-bases-gantt](https://github.com/lhassa8/obsidian-bases-gantt) by
Lars Tray ([lhassa8](https://github.com/lhassa8)), licensed under the **MIT License**.

The MIT License is compatible with GPL v3: MIT code may be included in a GPL v3 project, and the
whole project is then governed by GPL v3. The original MIT copyright notice is preserved in the
[LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) files as required.

---

## Features

- **Calendar view** — Month, Week, Day, and List layouts. Open and navigate your dated notes at a
  glance. See the [Calendar View documentation](docs/calendar-view.md).
- **Swimlane view** — Drag-and-drop board with columns and optional swimlane rows. You choose
  the property for columns (and rows); nothing is preselected. Formerly named "Kanban"; renamed
  because Obsidian now ships a core Kanban view.
- **Gantt view** — Phase-aware schedule built on
  [@jaeungkim/gantt-chart](https://github.com/jaeungkim/gantt-chart). Parent notes and native Bases
  grouping become phases, finish-to-start dependencies are drawn and edited on the chart, and
  moving, resizing, progress, links, order, and note creation are written back to your properties.
  Blocking and date conflicts are derived from Depends on. See the
  [Gantt documentation](docs/gantt-view.md) for goal-based recipes and option relationships.
- **Timeline view** — Grouped, virtualized date ranges plus quick placement of unscheduled notes
  into user-selected start/end properties, with no task-schema assumptions. See the
  [Timeline View documentation](docs/timeline-view.md).

All views are **Obsidian Bases-native**: they use your selected frontmatter properties directly and
introduce no hidden task schema.

---

## Requirements

- Obsidian **1.14.4** or later
- Desktop is supported.
- Mobile is enabled (`isDesktopOnly: false`) and should be treated as best-effort until Android
  and iOS testing is complete.

---

## Installation

### Manual (for development / testing)

1. Run the production build:

   ```bash
   pnpm install
   pnpm run build
   ```

2. Copy `main.js`, `manifest.json`, and `styles.css` from `dist/` to your vault:

   ```text
   <Vault>/.obsidian/plugins/unimian/
   ```

3. Enable the plugin in **Settings → Community plugins**.

### Community Plugin Store

Submission to the Obsidian community plugin store is planned once the plugin reaches a stable
feature set.

---

## Usage

Open any folder as a Base (right-click → **New base from folder**), then select the view type
dropdown to **Calendar**, **Swimlane**, **Gantt**, or **Timeline**.

### Recommended frontmatter shape

Unimian does not enforce a schema. Any dated frontmatter works. Common example:

```yaml
---
title: Website Redesign
status: In Progress
priority: High
date_start: 2026-03-01
date_end: 2026-03-31
progress: 40
---
```

---

## Platform support

Unimian is designed for Obsidian desktop and does not use Electron-only runtime APIs in the
plugin source. Mobile support is enabled for beta testing, but complex Calendar, Swimlane, Gantt, and Timeline
interactions may need platform-specific testing on Android and iOS.

---

## Privacy and data handling

Unimian reads and writes notes through Obsidian's vault APIs. It does not use telemetry, analytics,
account sign-in, payments, ads, or files outside your vault, and it sends no data anywhere.

One case loads content from the network: when a note's cover property holds an `http://` or
`https://` image address, the card shows that image, so Obsidian requests it from that server.
The server can see your IP address, as with any remote image in a note. Covers that point to files
in your vault involve no network request.

---

## Upgrading

### Version numbering restarted at 0.0.1

Versions 1.0.1 to 1.0.3 were early learning releases. They have been withdrawn, and their tags and
GitHub releases removed. Version numbering starts again at 0.0.1 and follows
[Semantic Versioning](https://semver.org/). Before 1.0.0 anything may change between releases,
including view options and the properties Unimian writes; the [changelog](CHANGELOG.md) says when
it does.

If you installed one of the withdrawn versions, Obsidian will not offer 0.0.1 as an update,
because the number is lower than the one installed. Replace `main.js`, `manifest.json`, and
`styles.css` in `<Vault>/.obsidian/plugins/unimian/` with the files from the new release, and keep
`data.json`, which holds your plugin settings. View options are stored in your `.base` files and
are not affected.

### Kanban view renamed to Swimlane

The Kanban view is now the **Swimlane** view. The Unimian view type is `unimian-swimlane`.
Older Bases files may still contain the previous type; update that value manually if needed:

```yaml
views:
  - type: unimian-swimlane # previously: wise-view-kanban or wise-view-swimlane
```

Views no longer preselect properties. Choose **Columns by** (the board shows a prompt until you
do), and **Title by**, **Color by**, **Cover field**, and **Summary field** if you want them; an
unset title shows the file name. In Calendar, **Title field** is empty by default (file name) and
all-day events come from the new **All-day field** option instead of a fixed `all_day` property.

---

## Migrating from the earlier Gantt view

The Frappe-based Gantt view was replaced. The Unimian view type is `unimian-gantt`. Older Bases files
that refer to `wise-view-gantt` need that type changed manually if they are still used.

- **Your settings are imported once**, on first open: start, end, label, dependencies, parent, progress,
  color by, view mode, task list, note template and folder, and the "move dependent tasks" policy. A notice
  says how many were imported.
- **The chart is read-only until you turn off "Read only"** in the view options. The old view wrote on
  drag; Gantt asks first. Dependencies stay in the same property.
- **Not carried over:** expected progress, bar height, the Hour / Quarter day / Half day scales (imported as
  Day), the right-click menu, the WBS sidebar (replaced by the task list and phases), the Gantt
  command-palette commands, and the "Gantt defaults" settings.
- A development build with view type `wise-view-gantt-beta` was never released; use `unimian-gantt`
  if that configuration is still present.

## Known limitations

- Unimian requires the Obsidian Bases API, so older Obsidian versions are not supported.
- Gantt is read-only until you turn off **Read only** in its view options. Once editing is on, it
  writes dates, progress, Depends on, Parent, and Order only to the properties you mapped, and only
  when you drag, draw, or edit in the view.
- Gantt has not been verified on mobile or in a popout window, and keyboard editing is untested.
  Drags may not work in a popout window (a limitation of the chart library).
- Calendar date changes write only to the mapped frontmatter properties when you directly create,
  drag, or edit an item in the view.
- Mobile support is best-effort until tested on Android and iOS.

---

## Troubleshooting

- If the plugin does not load, confirm `main.js`, `manifest.json`, and `styles.css` are in
  `<Vault>/.obsidian/plugins/unimian/`.
- If the view types do not appear, disable and re-enable Unimian in **Settings → Community
  plugins**.
- If a Base shows no entries, confirm your notes have values in the configured frontmatter
  properties.
- If you are testing a local build, run `pnpm run build` before copying release artifacts.

---

## Development

```bash
# Install dependencies
pnpm install

# Watch mode (rebuilds on save)
pnpm run dev

# Production build
pnpm run build
```

The build output (`main.js`, `manifest.json`, `styles.css`) is written to `dist/`.
`pnpm run deploy` builds and copies it to the test vault named in `.env`.

---

## License

This project is licensed under the **GNU General Public License v3.0 only** (`GPL-3.0-only`).
The original Planner code is licensed under GPL v3 without an "or any later version" clause, so
the combined work is distributed under that version.

```text
Copyright (C) 2025  Sawyer Rensel  (original Planner codebase)
Copyright (C) 2026  Parkis Utama   (modifications in Unimian)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, version 3 of the License only.
```

See the [LICENSE](LICENSE) file for the full license text.

### Dependency licenses

These components are bundled into the distributed `main.js` and `styles.css`. Full license texts
are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

| Dependency | License | Copyright | Notes |
| --- | --- | --- | --- |
| [obsidian-bases-gantt](https://github.com/lhassa8/obsidian-bases-gantt) | MIT | Lars Tray | Adapted plugin code (attribution under review) |
| [Gantt Chart](https://github.com/jaeungkim/gantt-chart) | MIT | jaeungkim | Gantt view (`@jaeungkim/gantt-chart`; JavaScript and stylesheet, unmodified), including its inlined [Day.js](https://github.com/iamkun/dayjs) and [Zustand](https://github.com/pmndrs/zustand) |
| [FullCalendar](https://fullcalendar.io/) | MIT | Adam Shaw | Calendar view (`fullcalendar`, `@full-ui/headless-calendar`, `temporal-polyfill`, `temporal-utils`; JavaScript and stylesheets) |
| [Preact](https://preactjs.com/) | MIT | Jason Miller | Rendering library used by FullCalendar, and the runtime the Gantt view's React-targeting library runs on |

The [Obsidian API](https://obsidian.md/) is provided by the Obsidian app at runtime and is not
bundled.

---

## Acknowledgments

- **[Sawyer Rensel](https://github.com/SawyerRensel)** — author of the original
  [Obsidian Planner](https://github.com/SawyerRensel/Planner), whose codebase is the foundation
  of this plugin. Thank you for building in the open and choosing a copyleft license that keeps
  derivative work free.
- **[lhassa8](https://github.com/lhassa8)** — author of
  [obsidian-bases-gantt](https://github.com/lhassa8/obsidian-bases-gantt), which demonstrated a
  clean pattern for putting a Gantt chart into Obsidian Bases.
- **[jaeungkim](https://github.com/jaeungkim)** — author of the MIT-licensed
  [Gantt Chart](https://github.com/jaeungkim/gantt-chart) library that renders the current Gantt
  view, with phases, dependency drawing, and a working calendar built in.
- **[mmattia09](https://github.com/mmattia09)** — whose MIT-licensed
  [obsidian-project-manager](https://github.com/mmattia09/obsidian-project-manager) provided
  the attributed Timeline controls, temporal grid, navigation, zoom, quick scheduling behavior,
  and styling. Task status/priority workflows and unrelated property writes remain excluded.
- The [Obsidian](https://obsidian.md/) team for building the Bases API.
- [FullCalendar](https://fullcalendar.io/) projects.
