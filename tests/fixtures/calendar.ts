// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type UnimianPlugin from "../../src/main";
import { DEFAULT_SETTINGS } from "../../src/types/settings";
import { BasesCalendarView } from "../../src/views/BasesCalendarView";
// Import the test double directly so this file type-checks against it; at runtime "obsidian"
// resolves to the same module through the vitest alias.
import { TFile } from "./obsidian";

/** A note as Bases exposes it: frontmatter keyed by property name. */
export interface NoteFixture {
	path: string;
	[property: string]: string;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Local date (YYYY-MM-DD) or datetime (YYYY-MM-DDTHH:00:00) `offsetDays` from today. */
export function dayOffset(offsetDays: number, hour?: number): string {
	const now = new Date();
	const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, hour ?? 0);
	const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	return hour === undefined ? date : `${date}T${pad(hour)}:00:00`;
}

export const sampleNotes = (): NoteFixture[] => [
	{
		path: "Projects/Launch.md",
		title: "Launch review",
		date_start: dayOffset(0, 10),
		date_end: dayOffset(0, 12),
		status: "active",
	},
	{
		path: "Projects/Offsite.md",
		title: "Team offsite",
		date_start: dayOffset(-2),
		date_end: dayOffset(1),
		status: "planned",
	},
	{
		path: "Projects/Report.md",
		title: "Quarterly report",
		date_start: dayOffset(3, 14),
		date_end: dayOffset(3, 15),
		status: "done",
	},
];

export interface CalendarHarnessOptions {
	notes?: NoteFixture[];
	/** Bases view options (the calendar's `config.get` values). */
	config?: Record<string, unknown>;
	/** Vault paths that exist, e.g. daily notes `YYYY-MM-DD.md` at the vault root. */
	existingFiles?: string[];
}

export interface CalendarHarness {
	view: BasesCalendarView;
	host: HTMLElement;
	/** Files opened through workspace.openLinkText. */
	opened: string[];
	/** Paths passed to the hover-link workspace event. */
	hovered: string[];
	/** Frontmatter written through fileManager.processFrontMatter. */
	frontmatter: Array<{ path: string; values: Record<string, unknown> }>;
	/** Paths trashed through fileManager.trashFile. */
	trashed: string[];
	destroy(): void;
}

/** Mount the real BasesCalendarView against the obsidian test double. */
export function createCalendarHarness(options: CalendarHarnessOptions = {}): CalendarHarness {
	const notes = options.notes ?? sampleNotes();
	const files = new Set(options.existingFiles ?? []);
	const config: Record<string, unknown> = {
		defaultView: "dayGridMonth",
		colorBy: "note.status",
		dateStartField: "note.date_start",
		dateEndField: "note.date_end",
		titleField: "note.title",
		...options.config,
	};

	const opened: string[] = [];
	const hovered: string[] = [];
	const frontmatter: CalendarHarness["frontmatter"] = [];
	const trashed: string[] = [];

	const entries = notes.map((note) => ({
		file: new TFile(note.path),
		getValue: (id: string) => note[id.replace(/^(note|file|formula)\./, "")] ?? null,
	}));
	// The gateway resolves a TFile by path before writing/trashing; the vault must know about
	// both the entries' own notes and any extra "existing" files (e.g. daily notes).
	const entryPaths = new Set(entries.map((entry) => entry.file.path));

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) =>
				files.has(path) || entryPaths.has(path) ? new TFile(path) : null,
		},
		workspace: {
			openLinkText: async (path: string) => {
				opened.push(path);
			},
			trigger: (name: string, event: { linktext?: string }) => {
				if (name === "hover-link" && event.linktext) hovered.push(event.linktext);
			},
		},
		fileManager: {
			processFrontMatter: async (file: TFile, update: (fm: Record<string, unknown>) => void) => {
				const values: Record<string, unknown> = {};
				update(values);
				frontmatter.push({ path: file.path, values });
			},
			trashFile: async (file: TFile) => {
				trashed.push(file.path);
			},
		},
	};

	const controller = {
		app,
		config: { get: (key: string) => config[key] },
		data: { groupedData: [{ entries, hasKey: () => false }] },
	};
	const plugin = { app, settings: structuredClone(DEFAULT_SETTINGS) } as unknown as UnimianPlugin;

	const host = document.createElement("div");
	host.style.height = "800px";
	document.body.appendChild(host);

	// The QueryController shape is internal to Obsidian; the view only reads app/config/data.
	const view = new BasesCalendarView(controller as never, host, plugin);
	view.onDataUpdated();

	return {
		view,
		host,
		opened,
		hovered,
		frontmatter,
		trashed,
		destroy() {
			view.onunload();
			host.remove();
		},
	};
}
