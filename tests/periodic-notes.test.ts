// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import {
	periodicKeys,
	readPeriodicConfig,
	WEEK_NUMBERING_KEY,
} from "../src/views/calendar/periodic/config";
import {
	eventTemplateDefaults,
	existingPeriodicNotePath,
	isPeriodicNote,
	openPeriodicNote,
	periodicNoteTarget,
} from "../src/views/calendar/periodic/notes";
import { TFile } from "./fixtures/obsidian";

const configFrom = (values: Record<string, unknown>, weekStartsOn = 1) =>
	readPeriodicConfig((key) => values[key], weekStartsOn);
const DAY = "timeline/YYYY/YYYY-MM/YYYY-MM-DD";
const dayConfig = (extra: Record<string, unknown> = {}) =>
	configFrom({ [periodicKeys("day").path]: DAY, ...extra });
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

/** A vault of `files` (path -> content) plus recorders for what the code under test does. */
function fakeApp(
	files: Record<string, string> = {},
	options: { templater?: boolean; movedTo?: string } = {},
) {
	const store = new Map(Object.entries(files));
	const calls = {
		created: [] as string[],
		folders: [] as string[],
		opened: [] as string[],
		templater: [] as string[],
	};
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => (store.has(path) ? new TFile(path) : null),
			getFileByPath: (path: string) => (store.has(path) ? new TFile(path) : null),
			getFolderByPath: (path: string) => (calls.folders.includes(path) ? {} : null),
			getRoot: () => ({}),
			createFolder: async (path: string) => {
				calls.folders.push(path);
			},
			create: async (path: string, content: string) => {
				store.set(path, content);
				calls.created.push(path);
				return new TFile(path);
			},
			cachedRead: async (file: TFile) => store.get(file.path) ?? "",
		},
		workspace: {
			openLinkText: async (path: string) => {
				calls.opened.push(path);
			},
		},
		fileManager: { processFrontMatter: async () => {} },
		plugins: options.templater
			? {
					plugins: {
						"templater-obsidian": {
							templater: {
								create_new_note_from_template: async (
									_template: TFile,
									_folder: unknown,
									name: string,
								) => {
									calls.templater.push(name);
									// A template may move the note (tp.file.move); otherwise it lands in the folder given.
									return new TFile(
										options.movedTo ?? `${calls.folders[calls.folders.length - 1]}/${name}.md`,
									);
								},
							},
						},
					},
				}
			: undefined,
	};
	return { app: app as unknown as App, calls };
}

describe("periodicNoteTarget", () => {
	it("is unconfigured without a pattern, and resolves the clicked date otherwise", () => {
		expect(periodicNoteTarget(d(2026, 9, 22), "day", configFrom({}))).toEqual({
			status: "unconfigured",
		});
		expect(periodicNoteTarget(d(2026, 9, 22), "day", dayConfig())).toEqual({
			status: "ok",
			path: "timeline/2026/2026-09/2026-09-22.md",
			folder: "timeline/2026/2026-09",
		});
	});

	it("resolves the ISO week of a future date by default", () => {
		const config = configFrom({ [periodicKeys("week").path]: "timeline/GGGG/GGGG-[W]WW" });
		expect(periodicNoteTarget(d(2026, 12, 31), "week", config)).toMatchObject({
			path: "timeline/2026/2026-W53.md",
		});
	});

	it("refuses an unsafe pattern", () => {
		const config = configFrom({ [periodicKeys("day").path]: "../YYYY-MM-DD" });
		expect(periodicNoteTarget(d(2026, 9, 22), "day", config)).toMatchObject({ status: "refused" });
	});

	it("follows the locale week rule when chosen", () => {
		// Sunday 29 Dec 2024 is week 1 of 2025 under a Sunday-start rule (first weekday 0).
		const config = configFrom(
			{ [periodicKeys("week").path]: "gggg-[W]ww", [WEEK_NUMBERING_KEY]: "locale" },
			0,
		);
		expect(periodicNoteTarget(d(2024, 12, 29), "week", config)).toMatchObject({
			path: "2025-W01.md",
		});
	});
});

describe("existingPeriodicNotePath", () => {
	it("finds the configured path only, not a legacy root-level note", () => {
		const { app } = fakeApp({ "timeline/2026/2026-09/2026-09-22.md": "", "2026-09-23.md": "" });
		expect(existingPeriodicNotePath(app, d(2026, 9, 22), "day", dayConfig())).toBe(
			"timeline/2026/2026-09/2026-09-22.md",
		);
		expect(existingPeriodicNotePath(app, d(2026, 9, 23), "day", dayConfig())).toBeNull();
		expect(existingPeriodicNotePath(app, d(2026, 9, 22), "day", configFrom({}))).toBeNull();
	});
});

describe("openPeriodicNote", () => {
	it("opens an existing note without creating anything", async () => {
		const { app, calls } = fakeApp({ "timeline/2026/2026-09/2026-09-22.md": "" });
		await openPeriodicNote(app, d(2026, 9, 22), "day", dayConfig());
		expect(calls.created).toEqual([]);
		expect(calls.opened).toEqual(["timeline/2026/2026-09/2026-09-22.md"]);
	});

	it("creates a missing future note through Templater, named from the clicked date", async () => {
		const { app, calls } = fakeApp(
			{ "templates/daily.md": "<% tp.file.title %>" },
			{ templater: true },
		);
		const config = dayConfig({ [periodicKeys("day").template]: "templates/daily.md" });
		await openPeriodicNote(app, d(2026, 9, 22), "day", config);
		expect(calls.templater).toEqual(["2026-09-22"]);
		expect(calls.opened).toEqual(["timeline/2026/2026-09/2026-09-22.md"]);
	});

	it("opens the path a template moved the note to, never the pattern's path", async () => {
		const { app, calls } = fakeApp(
			{ "templates/daily.md": "<%* await tp.file.move('Inbox/x') %>" },
			{
				templater: true,
				movedTo: "Inbox/2026-09-22.md",
			},
		);
		const config = dayConfig({ [periodicKeys("day").template]: "templates/daily.md" });
		await openPeriodicNote(app, d(2026, 9, 22), "day", config);
		expect(calls.opened).toEqual(["Inbox/2026-09-22.md"]);
	});

	it("without any engine copies the template unprocessed and creates the folders", async () => {
		const { app, calls } = fakeApp({ "templates/daily.md": "Hello {{date}}" });
		const config = dayConfig({ [periodicKeys("day").template]: "templates/daily.md" });
		await openPeriodicNote(app, d(2026, 9, 22), "day", config);
		expect(calls.folders).toEqual(["timeline", "timeline/2026", "timeline/2026/2026-09"]);
		expect(calls.created).toEqual(["timeline/2026/2026-09/2026-09-22.md"]);
		expect(calls.opened).toEqual(["timeline/2026/2026-09/2026-09-22.md"]);
	});

	it("creates an empty note when no template is set, and when it cannot be found", async () => {
		const first = fakeApp();
		await openPeriodicNote(first.app, d(2026, 9, 22), "day", dayConfig());
		expect(first.calls.created).toEqual(["timeline/2026/2026-09/2026-09-22.md"]);

		const second = fakeApp();
		await openPeriodicNote(
			second.app,
			d(2026, 9, 22),
			"day",
			dayConfig({ [periodicKeys("day").template]: "nope.md" }),
		);
		expect(second.calls.created).toEqual(["timeline/2026/2026-09/2026-09-22.md"]);
	});

	it("does nothing for an unconfigured period and creates nothing for an unsafe one", async () => {
		const { app, calls } = fakeApp();
		await openPeriodicNote(app, d(2026, 9, 22), "day", configFrom({}));
		await openPeriodicNote(
			app,
			d(2026, 9, 22),
			"day",
			configFrom({ [periodicKeys("day").path]: "/abs/YYYY" }),
		);
		expect(calls.created).toEqual([]);
		expect(calls.opened).toEqual([]);
	});
});

describe("isPeriodicNote", () => {
	const all = configFrom({
		[periodicKeys("day").path]: "timeline/YYYY/YYYY-MM/YYYY-MM-DD",
		[periodicKeys("week").path]: "timeline/GGGG/GGGG-[W]WW",
		[periodicKeys("month").path]: "timeline/YYYY/YYYY-MM",
		[periodicKeys("quarter").path]: "timeline/YYYY/YYYY-[Q]Q",
		[periodicKeys("year").path]: "timeline/YYYY",
	});

	it.each([
		["timeline/2026/2026-09/2026-09-21.md", "2026-09-21"],
		["timeline/2026/2026-W39.md", "2026-09-21"],
		["timeline/2026/2026-09.md", "2026-09-01"],
		["timeline/2026/2026-Q3.md", "2026-07-01"],
		["timeline/2026.md", "2026-01-01"],
		["timeline/2026/2026-09/2026-09-21.md", "2026-09-21T00:00:00+07:00"],
	])("hides %s starting %s", (path, start) => {
		expect(isPeriodicNote(path, start, all)).toBe(true);
	});

	it("keeps ordinary events, and periodic notes whose date does not match their own path", () => {
		expect(isPeriodicNote("Projects/Launch.md", "2026-09-21", all)).toBe(false);
		expect(isPeriodicNote("timeline/2026/2026-09/2026-09-21.md", "2026-09-22", all)).toBe(false);
		expect(isPeriodicNote("timeline/2026/2026-09/2026-09-21.md", "not a date", all)).toBe(false);
	});

	it("hides nothing when no period is configured", () => {
		expect(
			isPeriodicNote("timeline/2026/2026-09/2026-09-21.md", "2026-09-21", configFrom({})),
		).toBe(false);
	});
});

describe("eventTemplateDefaults", () => {
	const defaults = { templatePath: "", targetFolder: "", titleFormat: "Event {{date}} {{time}}" };

	it("resolves an event's folder from its start day alone, however many days it spans", () => {
		const result = eventTemplateDefaults(defaults, d(2026, 9, 22), dayConfig());
		expect(result).toEqual({ ...defaults, targetFolder: "timeline/2026/2026-09" });
	});

	it("keeps an explicit target folder and leaves unconfigured Bases alone", () => {
		expect(
			eventTemplateDefaults({ ...defaults, targetFolder: "Events" }, d(2026, 9, 22), dayConfig())
				?.targetFolder,
		).toBe("Events");
		expect(eventTemplateDefaults(defaults, d(2026, 9, 22), configFrom({}))).toBe(defaults);
	});

	it("refuses an unsafe pattern instead of choosing a folder", () => {
		const config = configFrom({ [periodicKeys("day").path]: "../YYYY/YYYY-MM-DD" });
		expect(eventTemplateDefaults(defaults, d(2026, 9, 22), config)).toBeNull();
	});
});
