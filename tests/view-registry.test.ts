// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { describe, expect, it } from "vitest";
import UnimianPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/types/settings";
import {
	ConflictingMutationCapabilitiesError,
	DuplicateViewIdError,
	InvalidViewIdError,
	UnapprovedMutationGrantError,
	type ViewDescriptor,
	ViewRegistry,
	validateViewDescriptor,
} from "../src/viewRegistry";
import {
	BASES_CALENDAR_VIEW_ID,
	createCalendarViewRegistration,
} from "../src/views/BasesCalendarView";
import {
	BASES_SWIMLANE_VIEW_ID,
	createSwimlaneViewRegistration,
} from "../src/views/BasesSwimlaneView";
import { BASES_GANTT_VIEW_ID, createGanttViewRegistration } from "../src/views/gantt";
import { BASES_STICKY_NOTE_VIEW_ID } from "../src/views/sticky-note";
import {
	BASES_TIMELINE_VIEW_ID,
	createTimelineViewRegistration,
	getTimelineViewOptions,
} from "../src/views/timeline";

const plugin = { app: {}, settings: structuredClone(DEFAULT_SETTINGS) } as unknown as UnimianPlugin;

function throwIfCalled(): never {
	throw new Error("factory must not be called while building or validating a descriptor");
}

/** A descriptor whose factory would throw if the registry ever instantiated it. */
function describedView(id: string, name: string, icon: string): ViewDescriptor {
	return { id, name, icon, factory: throwIfCalled as never };
}

describe("validateViewDescriptor", () => {
	it("accepts an id under the unimian- prefix", () => {
		expect(() =>
			validateViewDescriptor(describedView("unimian-timeline", "Timeline", "clock")),
		).not.toThrow();
	});

	it("rejects an id without the unimian- prefix", () => {
		expect(() => validateViewDescriptor(describedView("timeline", "Timeline", "clock"))).toThrow(
			InvalidViewIdError,
		);
	});
});

describe("ViewRegistry", () => {
	it("registers descriptors without calling their factory", () => {
		const registry = new ViewRegistry();
		expect(() =>
			registry.register(describedView("unimian-timeline", "Timeline", "clock")),
		).not.toThrow();
		expect(registry.has("unimian-timeline")).toBe(true);
	});

	it("fails deterministically on a duplicate id", () => {
		const registry = new ViewRegistry();
		registry.register(describedView("unimian-timeline", "Timeline", "clock"));
		expect(() =>
			registry.register(describedView("unimian-timeline", "Timeline 2", "clock")),
		).toThrow(DuplicateViewIdError);
	});

	it("fails deterministically on an invalid id, before storing it", () => {
		const registry = new ViewRegistry();
		expect(() => registry.register(describedView("timeline", "Timeline", "clock"))).toThrow(
			InvalidViewIdError,
		);
		expect(registry.has("timeline")).toBe(false);
	});

	it("lists descriptors in registration order", () => {
		const registry = new ViewRegistry();
		registry.register(describedView("unimian-a", "A", "a"));
		registry.register(describedView("unimian-b", "B", "b"));
		expect(registry.list().map((d) => d.id)).toEqual(["unimian-a", "unimian-b"]);
	});

	it("expresses all views without view-specific registry branching", () => {
		const registry = new ViewRegistry();
		const calendar = createCalendarViewRegistration(plugin);
		const swimlane = createSwimlaneViewRegistration(plugin);
		const timeline = createTimelineViewRegistration(plugin);
		const gantt = createGanttViewRegistration(plugin);

		registry.register({
			id: BASES_GANTT_VIEW_ID,
			name: gantt.name,
			icon: gantt.icon,
			factory: gantt.factory,
			hover: { display: "Gantt", defaultMod: true },
			capabilities: { mutations: ["date", "property", "dependency", "fileCreate"] },
		});
		registry.register({
			id: BASES_CALENDAR_VIEW_ID,
			name: calendar.name,
			icon: calendar.icon,
			factory: calendar.factory,
			options: calendar.options,
			hover: { display: "Calendar", defaultMod: true },
			capabilities: { legacyMutation: true },
		});
		registry.register({
			id: BASES_TIMELINE_VIEW_ID,
			name: timeline.name,
			icon: timeline.icon,
			factory: timeline.factory,
			options: timeline.options,
			hover: { display: "Timeline", defaultMod: true },
			capabilities: { legacyMutation: true },
		});
		registry.register({
			id: BASES_SWIMLANE_VIEW_ID,
			name: swimlane.name,
			icon: swimlane.icon,
			factory: swimlane.factory,
			options: swimlane.options,
			hover: { display: "Swimlane", defaultMod: true },
			capabilities: { legacyMutation: true },
		});

		expect(registry.list().map((d) => d.id)).toEqual([
			BASES_GANTT_VIEW_ID,
			BASES_CALENDAR_VIEW_ID,
			BASES_TIMELINE_VIEW_ID,
			BASES_SWIMLANE_VIEW_ID,
		]);
		for (const descriptor of registry.list()) {
			expect(descriptor.hover?.display).toBeTruthy();
		}
		expect(registry.get(BASES_TIMELINE_VIEW_ID)?.capabilities?.legacyMutation).toBe(true);
	});

	it("exposes schema-agnostic Timeline property and zoom options", () => {
		const serialized = JSON.stringify(getTimelineViewOptions());
		for (const key of ["start", "end", "titleBy", "colorBy", "zoom", "wrapTitles"]) {
			expect(serialized).toContain(`"key":"${key}"`);
		}
		expect(serialized).not.toContain("groupProperty");
		expect(serialized).not.toContain("status");
		expect(serialized).not.toContain("priority");
	});

	it("never uses a Bases-reserved view-config key (type/name/filters/groupBy/order/summaries) for a custom option", () => {
		// Obsidian's own .base file schema reserves these at the top level of a view's config
		// (BasesViewConfigFile). Reusing one for a plugin-defined option makes Obsidian write a
		// value of the wrong shape into that reserved slot and refuse to parse the whole file.
		const reserved = new Set(["type", "name", "filters", "groupBy", "order", "summaries"]);
		const keys =
			JSON.stringify(getTimelineViewOptions())
				.match(/"key":"([^"]+)"/g)
				?.map((m) => m.slice(7, -1)) ?? [];
		expect(keys.length).toBeGreaterThan(0);
		for (const key of keys) expect(reserved.has(key)).toBe(false);
	});
});

describe("UnimianPlugin.onload view registration", () => {
	it("registers each Bases view and hover source exactly once, and no command", async () => {
		const app = {
			plugins: { plugins: {} },
			vault: { on: () => ({}) as never, getAbstractFileByPath: () => null },
		};
		const realPlugin = new UnimianPlugin(app as never, {} as never);
		const registeredViews: string[] = [];
		const registeredHovers: string[] = [];
		const registeredCommands: string[] = [];

		Object.assign(realPlugin, {
			registerBasesView: (id: string) => {
				registeredViews.push(id);
				return true;
			},
			registerHoverLinkSource: (id: string) => {
				registeredHovers.push(id);
			},
			addCommand: (command: { id: string }) => {
				registeredCommands.push(command.id);
			},
			addSettingTab: () => {},
		});

		await realPlugin.onload();

		expect(registeredViews).toEqual([
			BASES_SWIMLANE_VIEW_ID,
			BASES_CALENDAR_VIEW_ID,
			BASES_TIMELINE_VIEW_ID,
			BASES_GANTT_VIEW_ID,
			BASES_STICKY_NOTE_VIEW_ID,
		]);
		expect(new Set(registeredViews).size).toBe(registeredViews.length);
		expect(registeredHovers).toEqual([
			BASES_SWIMLANE_VIEW_ID,
			BASES_CALENDAR_VIEW_ID,
			BASES_TIMELINE_VIEW_ID,
			BASES_GANTT_VIEW_ID,
			BASES_STICKY_NOTE_VIEW_ID,
		]);
		expect(registeredCommands).toEqual([]);
	});
});

describe("scoped mutation grants (GBETA-003)", () => {
	const app = {} as never;

	it("gives a descriptor without a grant no capability at all", () => {
		const registry = new ViewRegistry();
		registry.register(describedView("unimian-a", "A", "a"));

		expect(registry.mutationsFor("unimian-a", app)).toEqual({});
		expect(registry.mutationsFor("unimian-unknown", app)).toEqual({});
	});

	it("gives a legacy-mutation descriptor no scoped capability", () => {
		const registry = new ViewRegistry();
		registry.register({
			...describedView("unimian-a", "A", "a"),
			capabilities: { legacyMutation: true },
		});

		expect(registry.mutationsFor("unimian-a", app)).toEqual({});
	});

	it("gives an approved descriptor exactly the capabilities it declared", () => {
		const registry = new ViewRegistry();
		registry.register({
			...describedView("unimian-gantt", "Gantt", "gantt"),
			capabilities: { mutations: ["date", "fileCreate"] },
		});

		const granted = registry.mutationsFor("unimian-gantt", app);
		expect(Object.keys(granted).sort()).toEqual(["date", "fileCreate"]);
		expect(Object.keys(granted.date ?? {})).toEqual(["updateRange"]);
	});

	it("rejects scoped mutations on a view that is not approved", () => {
		const descriptor = {
			...describedView("unimian-other", "Other", "x"),
			capabilities: { mutations: ["date"] as const },
		};

		expect(() => validateViewDescriptor(descriptor)).toThrow(UnapprovedMutationGrantError);
		expect(() => new ViewRegistry().register(descriptor)).toThrow(UnapprovedMutationGrantError);
	});

	it("rejects a descriptor that declares both legacy and scoped mutations", () => {
		const descriptor = {
			...describedView("unimian-gantt", "Gantt", "gantt"),
			capabilities: { legacyMutation: true, mutations: ["date"] as const },
		};

		expect(() => validateViewDescriptor(descriptor)).toThrow(ConflictingMutationCapabilitiesError);
	});
});
