// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { ComponentChild, VNode } from "preact";
import { describe, expect, it, vi } from "vitest";
import { BasesGanttView } from "../src/views/gantt";
import {
	GANTT_OPTION_KEYS,
	LEGACY_IMPORT_MARKER,
	type LegacyOptionConfig,
	migrateLegacyOptions,
} from "../src/views/gantt/legacyOptions";
import { getGanttViewOptions } from "../src/views/gantt/options";
import { DateValue, notices } from "./fixtures/obsidian";

function fakeConfig(initial: Record<string, unknown>) {
	const values: Record<string, unknown> = { ...initial };
	const writes: Array<[string, unknown]> = [];
	const config: LegacyOptionConfig = {
		get: (key) => values[key],
		set: (key, value) => {
			values[key] = value;
			writes.push([key, value]);
		},
	};
	return { config, values, writes };
}

describe("Gantt option keys and the permanent view id", () => {
	it("lists exactly the keys the option schema defines, plus the stored collapse state", () => {
		const schemaKeys = [
			...JSON.stringify(getGanttViewOptions({} as never)).matchAll(/"key":"(gantt[A-Za-z]+)"/g),
		].map((match) => match[1]);
		expect(schemaKeys.length).toBeGreaterThan(30);
		for (const key of schemaKeys) expect(GANTT_OPTION_KEYS).toContain(key);
		expect(GANTT_OPTION_KEYS.filter((key) => !schemaKeys.includes(key))).toEqual([
			"ganttCollapsedIds",
		]);
	});

	it("carries no beta wording in any stored key", () => {
		for (const key of [...GANTT_OPTION_KEYS, LEGACY_IMPORT_MARKER])
			expect(key).not.toMatch(/beta/i);
	});
});

describe("importing options saved by an earlier version", () => {
	it("copies every key of a development-build base to the permanent key", () => {
		const beta: Record<string, unknown> = {};
		for (const key of GANTT_OPTION_KEYS)
			beta[`ganttBeta${key.slice("gantt".length)}`] = `value:${key}`;
		const { config, values } = fakeConfig(beta);

		expect(migrateLegacyOptions(config)).toEqual([...GANTT_OPTION_KEYS]);
		for (const key of GANTT_OPTION_KEYS) expect(values[key]).toBe(`value:${key}`);
		expect(values[LEGACY_IMPORT_MARKER]).toBe(true);
	});

	it("maps a released Frappe-era base, including its display-cased view mode", () => {
		const { config, values } = fakeConfig({
			startDate: "note.start",
			endDate: "note.end",
			label: "note.title",
			dependencies: "note.after",
			colorBy: "note.status",
			progress: "note.done",
			parentProp: "note.phase",
			viewMode: "Week",
			showWbsSidebar: true,
			showProgress: true,
			templatePath: "Templates/Task",
			targetFolder: "Tasks",
			titleFormat: "Task {{date}}",
			persistDependencyDateChanges: true,
			barHeight: 30,
			expectedProgress: "note.expected",
		});

		migrateLegacyOptions(config);

		expect(values).toMatchObject({
			ganttStart: "note.start",
			ganttEnd: "note.end",
			ganttLabel: "note.title",
			ganttDependencyFS: "note.after",
			ganttColorBy: "note.status",
			ganttProgress: "note.done",
			ganttParent: "note.phase",
			ganttScale: "week",
			ganttShowTaskList: true,
			ganttShowProgress: true,
			ganttTemplatePath: "Templates/Task",
			ganttTargetFolder: "Tasks",
			ganttTitleFormat: "Task {{date}}",
			ganttDependencyShift: "maintain-gap",
		});
		// Settings with no equivalent are left alone, not guessed at.
		expect(values).not.toHaveProperty("ganttBarHeight");
		expect(values).not.toHaveProperty("ganttExpectedProgress");
	});

	it.each([
		["Day", "day"],
		["Week", "week"],
		["Month", "month"],
		["Year", "year"],
		["Quarter day", "day"],
		["Half day", "day"],
	])("maps the Frappe view mode %s to the %s scale", (mode, scale) => {
		const { config, values } = fakeConfig({ viewMode: mode });
		migrateLegacyOptions(config);
		expect(values.ganttScale).toBe(scale);
	});

	it('turns the old "move dependent tasks" flag into the schedule policy only when it was on', () => {
		const on = fakeConfig({ ganttBetaMoveDependencies: true });
		migrateLegacyOptions(on.config);
		expect(on.values.ganttDependencyShift).toBe("maintain-gap");

		const off = fakeConfig({
			persistDependencyDateChanges: false,
			ganttBetaMoveDependencies: false,
			startDate: "note.start",
		});
		migrateLegacyOptions(off.config);
		expect(off.values).not.toHaveProperty("ganttDependencyShift");
	});

	it("never overrides a permanent key that is already set, and prefers the development-build name over Frappe", () => {
		const { config, values } = fakeConfig({
			ganttStart: "note.new",
			ganttBetaStart: "note.beta",
			startDate: "note.frappe",
			ganttBetaEnd: "note.beta_end",
			endDate: "note.frappe_end",
		});
		migrateLegacyOptions(config);
		expect(values.ganttStart).toBe("note.new");
		expect(values.ganttEnd).toBe("note.beta_end");
	});

	it("imports once, so a value the user clears afterwards is not brought back", () => {
		const { config, values, writes } = fakeConfig({ startDate: "note.start" });
		migrateLegacyOptions(config);
		values.ganttStart = undefined;
		const before = writes.length;

		expect(migrateLegacyOptions(config)).toEqual([]);
		expect(writes).toHaveLength(before);
		expect(values.ganttStart).toBeUndefined();
	});

	it("writes nothing for a view with no earlier settings, not even the marker", () => {
		const { config, writes } = fakeConfig({ ganttStart: "note.start", ganttReadOnly: false });
		expect(migrateLegacyOptions(config)).toEqual([]);
		expect(writes).toEqual([]);
	});

	it("does nothing when the config cannot be written", () => {
		expect(migrateLegacyOptions({ get: () => "note.start" })).toEqual([]);
	});
});

describe("the view on a base saved by an earlier version", () => {
	function mountLegacy(values: Record<string, unknown>) {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const renders: ComponentChild[] = [];
		const stored: Record<string, unknown> = { ...values };
		const entry = {
			file: {
				path: "A.md",
				basename: "A",
				extension: "md",
				parent: null,
				stat: { ctime: 1, mtime: 2 },
			},
			getValue: (id: string) => (id === "note.start" ? new DateValue("2026-01-01") : null),
		};
		const app = {
			metadataCache: { getFirstLinkpathDest: () => null },
			vault: { getAbstractFileByPath: () => null },
			workspace: {},
		};
		const controller = {
			app,
			data: { groupedData: [{ entries: [entry], hasKey: () => false }] },
			config: {
				get: (key: string) => stored[key],
				set: (key: string, value: unknown) => {
					stored[key] = value;
				},
				getAsPropertyId: (key: string) => stored[key] ?? null,
				getOrder: () => [],
				getDisplayName: (id: string) => id,
			},
		};
		const view = new BasesGanttView(
			controller as never,
			host,
			{ app, settings: { valueStyles: {} } } as never,
			(node, container) => {
				renders.push(node);
				container.replaceChildren();
			},
			{},
		);
		view.onDataUpdated();
		return { view, renders, stored };
	}

	it("shows the schedule a Frappe-era base defined, read-only, and says what it imported", () => {
		notices.length = 0;
		const { view, renders, stored } = mountLegacy({ startDate: "note.start", viewMode: "Month" });
		const props = (renders.at(-1) as VNode<Record<string, unknown>>).props;

		expect(props.tasks).toHaveLength(1);
		expect(props).toMatchObject({ readOnly: true, defaultScale: "month" });
		expect(stored.ganttStart).toBe("note.start");
		expect(
			notices.some(
				(message) => message.includes("imported 2 settings") && message.includes("read-only"),
			),
		).toBe(true);
		view.onunload();
	});

	it("does not claim read-only when a development-build base had editing on", () => {
		notices.length = 0;
		const { view } = mountLegacy({ ganttBetaStart: "note.start", ganttBetaReadOnly: false });
		const message = notices.find((text) => text.includes("imported"));
		expect(message).toBeDefined();
		expect(message).not.toContain("read-only");
		view.onunload();
	});

	it("stays quiet for a base that already uses the permanent keys", () => {
		notices.length = 0;
		const { view } = mountLegacy({ ganttStart: "note.start" });
		expect(notices.some((message) => message.includes("imported"))).toBe(false);
		view.onunload();
		vi.restoreAllMocks();
	});
});
