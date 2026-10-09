// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { Task } from "@jaeungkim/gantt-chart";
import { describe, expect, it } from "vitest";
import { diffGanttTasks } from "../src/core/gantt/diff";
import { buildGanttMutationPlan } from "../src/core/gantt/mutationPlan";
import { SYNTHETIC_PHASE_PREFIX } from "../src/core/gantt/phases";

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
	id,
	name: id,
	startDate: "2026-10-01",
	endDate: "2026-10-03",
	parentId: null,
	sequence: "1",
	...overrides,
});

describe("Gantt diff and mutation plan (GBETA-009)", () => {
	it("writes only changed date/progress fields and restores an inclusive date end", () => {
		const before = [task("Tasks/A.md", { progress: 20 })];
		const after = [
			task("Tasks/A.md", { startDate: "2026-10-02", endDate: "2026-10-06", progress: 35 }),
		];

		const changes = diffGanttTasks(before, after);
		const plan = buildGanttMutationPlan(changes, {
			start: { id: "note.start", type: "date" },
			end: { id: "note.end", type: "date" },
			progress: "note.progress",
		});

		expect(plan).toEqual([
			{
				path: "Tasks/A.md",
				values: {
					"note.start": "2026-10-02",
					"note.end": "2026-10-05",
					"note.progress": 35,
				},
			},
		]);
	});

	it("turns a summary drag into descendant writes and never writes the synthetic summary", () => {
		const summaryId = `${SYNTHETIC_PHASE_PREFIX}group/Project`;
		const before = [
			task(summaryId, { startDate: "2026-10-01", endDate: "2026-10-05" }),
			task("Tasks/A.md", { parentId: summaryId, sequence: "1.1" }),
			task("Tasks/B.md", {
				parentId: summaryId,
				sequence: "1.2",
				startDate: "2026-10-03",
				endDate: "2026-10-05",
			}),
		];
		const after = before.map((item) => ({
			...item,
			startDate: item.startDate.replace("10-0", "10-1"),
			endDate: item.endDate.replace("10-0", "10-1"),
		}));

		const plan = buildGanttMutationPlan(diffGanttTasks(before, after), {
			start: { id: "note.start", type: "date" },
			end: { id: "note.end", type: "date" },
		});

		expect(plan.map((item) => item.path)).toEqual(["Tasks/A.md", "Tasks/B.md"]);
	});

	it("writes a real parent link and renumbers only siblings whose order value changes", () => {
		const before = [
			task("Tasks/A.md", { parentId: "Phase/Old.md", sequence: "1.1" }),
			task("Tasks/B.md", { parentId: "Phase/New.md", sequence: "2.1" }),
			task("Tasks/C.md", { parentId: "Phase/New.md", sequence: "2.2" }),
		];
		const after = [
			task("Tasks/B.md", { parentId: "Phase/New.md", sequence: "2.1" }),
			task("Tasks/A.md", { parentId: "Phase/New.md", sequence: "2.2" }),
			task("Tasks/C.md", { parentId: "Phase/New.md", sequence: "2.3" }),
		];

		const plan = buildGanttMutationPlan(diffGanttTasks(before, after), {
			parent: "note.parent",
			order: "note.order",
			currentOrder: new Map([
				["Tasks/A.md", 10],
				["Tasks/B.md", 10],
				["Tasks/C.md", 30],
			]),
		});

		expect(plan).toEqual([
			{ path: "Tasks/A.md", values: { "note.parent": "[[Phase/New]]", "note.order": 20 } },
		]);
	});

	it("updates Depends on while preserving array storage and ignoring dependency order", () => {
		const before = [
			task("Tasks/A.md", {
				dependencies: [
					{ targetId: "Tasks/B.md", type: "FS" },
					{ targetId: "Tasks/C.md", type: "FS" },
				],
			}),
		];
		const after = [
			task("Tasks/A.md", {
				dependencies: [
					{ targetId: "Tasks/D.md", type: "FS" },
					{ targetId: "Tasks/C.md", type: "FS" },
				],
			}),
		];

		const plan = buildGanttMutationPlan(diffGanttTasks(before, after), {
			dependsOn: "note.depends_on",
			currentDependsOn: new Map([["Tasks/A.md", ["[[Tasks/B]]", "[[Tasks/C]]"]]]),
			resolveLink: (target) => (target.endsWith(".md") ? target : `${target}.md`),
		});

		expect(plan).toEqual([
			{
				path: "Tasks/A.md",
				values: {
					"note.depends_on": ["[[Tasks/C]]", "[[Tasks/D]]"],
				},
			},
		]);
	});

	it("ignores unchanged, added, removed, and synthetic tasks", () => {
		const synthetic = task(`${SYNTHETIC_PHASE_PREFIX}group/A`);
		const before = [task("Same.md"), task("Removed.md"), synthetic];
		const after = [task("Same.md"), task("Added.md"), { ...synthetic, startDate: "2026-11-01" }];

		expect(diffGanttTasks(before, after)).toEqual([]);
	});
});
