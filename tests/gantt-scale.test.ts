// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { describe, expect, it, vi } from "vitest";
import type { EntrySnapshot } from "../src/core/entries/EntrySnapshot";
import type { NormalizedValue } from "../src/core/entries/NormalizedValue";
import {
	annotateDependencyStatus,
	computeDependencyStatus,
} from "../src/core/gantt/dependencyStatus";
import { compareSequence } from "../src/core/gantt/sequence";
import { readGanttOptions } from "../src/views/gantt/options";
import { mapSnapshotsToGanttTasks } from "../src/views/gantt/taskMapping";
import { GanttWriteBack } from "../src/views/gantt/writeBack";

// GBETA-016: a large Base must not freeze the UI on a refresh or a single gesture. The budgets are
// loose (roughly 10x what a laptop needs) so slow CI does not flake, but a return of the quadratic
// scans (one linear find per task, a numeric localeCompare per comparison) blows through them.
const TASKS = 2000;
const PHASES = 40;

const date = (value: string): NormalizedValue => ({ kind: "date", value, hasTime: false });
const link = (target: string): NormalizedValue => ({
	kind: "link",
	target,
	display: null,
	external: false,
});
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
const shiftIso = (value: string) =>
	new Date(
		Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value) + 86_400_000,
	).toISOString();

function entries(): EntrySnapshot[] {
	return Array.from({ length: TASKS }, (_, i) => {
		const values = new Map<string, NormalizedValue>([
			["note.start", date(day(i % 300))],
			["note.end", date(day((i % 300) + 5))],
			["note.progress", { kind: "number", value: (i * 7) % 101 }],
		]);
		if (i >= PHASES) values.set("note.parent", link(`T/${i % PHASES}`));
		if (i > PHASES + 2)
			values.set("note.dep", { kind: "list", items: [link(`T/${i - 1}`), link(`T/${i - 2}`)] });
		return {
			path: `T/${i}.md`,
			basename: String(i),
			extension: "md",
			folder: "T",
			ctime: 1,
			mtime: 2,
			values,
		};
	});
}

function timed<T>(run: () => T): { value: T; ms: number } {
	const start = performance.now();
	const value = run();
	return { value, ms: performance.now() - start };
}

describe("Gantt on a large Base (GBETA-016)", () => {
	const options = readGanttOptions({
		get: (key: string) =>
			(({ ganttPhases: true, ganttReadOnly: false }) as Record<string, unknown>)[key],
		getAsPropertyId: (key: string) =>
			(
				({
					ganttStart: "note.start",
					ganttEnd: "note.end",
					ganttProgress: "note.progress",
					ganttParent: "note.parent",
					ganttDependencyFS: "note.dep",
				}) as Record<string, string>
			)[key] ?? null,
		getOrder: () => [],
		getDisplayName: (id: string) => id,
	} as never);

	const mapped = timed(() =>
		mapSnapshotsToGanttTasks([{ entries: entries(), key: { kind: "missing" } }], options, {
			resolveLink: (target: string) => ({ path: `${target}.md`, name: target }),
			resolveColor: () => null,
		}),
	);

	it("maps and annotates thousands of notes well inside a frame budget multiple", () => {
		expect(mapped.value.tasks).toHaveLength(TASKS);
		expect(mapped.ms).toBeLessThan(1500);
		const annotated = timed(() =>
			annotateDependencyStatus(
				mapped.value.tasks,
				computeDependencyStatus(mapped.value.tasks, { trackCompletion: true }),
			),
		);
		expect(annotated.ms).toBeLessThan(500);
	});

	function writerFor(tasks: typeof mapped.value.tasks) {
		const ok = { ok: true as const };
		return new GanttWriteBack(tasks, {
			mutations: {
				date: { updateRange: vi.fn().mockResolvedValue(ok) },
				property: {
					setProperty: vi.fn().mockResolvedValue(ok),
					setProperties: vi.fn().mockResolvedValue(ok),
				},
				dependency: { setDependencies: vi.fn().mockResolvedValue(ok) },
			},
			properties: {
				start: { id: "note.start", type: "date" },
				end: { id: "note.end", type: "date" },
				progress: "note.progress",
				parent: "note.parent",
				dependsOn: "note.dep",
				dateTypes: new Map(),
			},
			revertTasks: () => {},
			notice: () => {},
			dependencyPolicy: "maintain-gap",
			writePhaseDates: true,
			renderTasks: () => {},
		});
	}

	it("handles one bar move without a per-task linear scan", () => {
		const tasks = mapped.value.tasks;
		const writer = writerFor(tasks);
		const target = `T/${TASKS - 1}.md`;
		const next = tasks.map((task) =>
			task.id === target
				? { ...task, startDate: `${day(50)}T00:00:00.000Z`, endDate: `${day(55)}T00:00:00.000Z` }
				: task,
		);

		// onTasksChange does its main-thread work before the first await; that part is what freezes the UI.
		expect(
			timed(() => {
				void writer.onTasksChange(next);
			}).ms,
		).toBeLessThan(500);
	});

	it("handles dragging every phase at once", () => {
		const tasks = mapped.value.tasks;
		const writer = writerFor(tasks);
		const phaseIds = new Set(
			tasks.map((task) => task.parentId).filter((id): id is string => id !== null),
		);
		const next = tasks.map((task) =>
			phaseIds.has(task.id) || (task.parentId && phaseIds.has(task.parentId))
				? { ...task, startDate: shiftIso(task.startDate), endDate: shiftIso(task.endDate) }
				: task,
		);

		expect(
			timed(() => {
				void writer.onTasksChange(next);
			}).ms,
		).toBeLessThan(1000);
	});
});

describe("compareSequence", () => {
	it("orders dotted sequences numerically, segment by segment", () => {
		const sorted = ["1.10", "1.2", "2", "1", "1.2.1", "10", "3.1"].sort(compareSequence);
		expect(sorted).toEqual(["1", "1.2", "1.2.1", "1.10", "2", "3.1", "10"]);
	});
});
