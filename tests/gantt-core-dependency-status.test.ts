import type { Task } from "@jaeungkim/gantt-chart";
import { describe, expect, it } from "vitest";
import {
	annotateDependencyStatus,
	BLOCKED_CLASS,
	CONFLICT_CLASS,
	computeDependencyStatus,
	dependencyStatusOf,
} from "../src/core/gantt/dependencyStatus";

const task = (id: string, start: string, end: string, overrides: Partial<Task> = {}): Task => ({
	id,
	name: id,
	startDate: start,
	endDate: end,
	parentId: null,
	sequence: id,
	...overrides,
});
const fs = (...targets: string[]) => targets.map((targetId) => ({ targetId, type: "FS" as const }));

describe("Gantt dependency status (derived blocking)", () => {
	const tasks = [
		task("A", "2026-10-01", "2026-10-05", { progress: 40 }),
		task("B", "2026-10-05", "2026-10-08", { progress: 100 }),
		task("C", "2026-10-04", "2026-10-09", { dependencies: fs("A", "B") }),
	];

	it("reads Depends on from the other side, so a predecessor blocks its dependents", () => {
		const status = computeDependencyStatus(tasks, { trackCompletion: true });
		expect(dependencyStatusOf(status, "A").blocks).toEqual(["C"]);
		expect(dependencyStatusOf(status, "B").blocks).toEqual(["C"]);
		expect(dependencyStatusOf(status, "C").dependsOn).toEqual(["A", "B"]);
		expect(dependencyStatusOf(status, "A").dependsOn).toEqual([]);
	});

	it("flags only predecessors that are unfinished", () => {
		const status = computeDependencyStatus(tasks, { trackCompletion: true });
		expect(dependencyStatusOf(status, "C").incomplete).toEqual(["A"]);
	});

	it("cannot know completion without a Progress property", () => {
		const status = computeDependencyStatus(tasks, { trackCompletion: false });
		expect(dependencyStatusOf(status, "C").incomplete).toEqual([]);
	});

	it("flags a task that starts before a predecessor finishes, but not one that starts exactly at its end", () => {
		const status = computeDependencyStatus(tasks, { trackCompletion: true });
		// A ends 10-05 and C starts 10-04 (conflict); B ends 10-08 and C starts 10-04 (conflict too).
		expect(dependencyStatusOf(status, "C").conflicts).toEqual(["A", "B"]);

		const touching = computeDependencyStatus(
			[
				task("A", "2026-10-01", "2026-10-05"),
				task("B", "2026-10-05", "2026-10-06", { dependencies: fs("A") }),
			],
			{ trackCompletion: false },
		);
		expect(dependencyStatusOf(touching, "B").conflicts).toEqual([]);
	});

	it("compares chart dates whether plain or ISO with a Z", () => {
		const status = computeDependencyStatus(
			[
				task("A", "2026-10-01T09:00", "2026-10-01T11:00"),
				task("B", "2026-10-01T10:00:00.000Z", "2026-10-01T12:00:00.000Z", {
					dependencies: fs("A"),
				}),
			],
			{ trackCompletion: false },
		);
		expect(dependencyStatusOf(status, "B").conflicts).toEqual(["A"]);
	});

	it("ignores unknown, self, duplicate, and non-FS predecessors", () => {
		const status = computeDependencyStatus(
			[
				task("A", "2026-10-01", "2026-10-02"),
				task("B", "2026-10-03", "2026-10-04", {
					dependencies: [...fs("A", "A", "Missing", "B"), { targetId: "A", type: "SS" as const }],
				}),
			],
			{ trackCompletion: true },
		);
		expect(dependencyStatusOf(status, "B").dependsOn).toEqual(["A"]);
		expect(dependencyStatusOf(status, "A").blocks).toEqual(["B"]);
	});

	it("tags bars for styling, keeps identity when nothing changes, and preserves existing classes", () => {
		const status = computeDependencyStatus(tasks, { trackCompletion: true });
		const annotated = annotateDependencyStatus(
			[...tasks, task("D", "2026-10-01", "2026-10-02", { className: "mine" })],
			status,
		);

		expect(annotated[2]!.className).toBe(`${BLOCKED_CLASS} ${CONFLICT_CLASS}`);
		expect(annotated[0]).toBe(tasks[0]);
		expect(annotated[3]!.className).toBe("mine");

		const again = annotateDependencyStatus(annotated, status);
		expect(again[2]).toBe(annotated[2]);
	});

	it("drops the tags once the conflict is resolved", () => {
		const fixed = tasks.map((item) =>
			item.id === "C" ? { ...item, startDate: "2026-10-08" } : item,
		);
		const status = computeDependencyStatus(fixed, { trackCompletion: true });
		const annotated = annotateDependencyStatus(
			annotateDependencyStatus(tasks, computeDependencyStatus(tasks, { trackCompletion: true })),
			status,
		);
		expect(annotated[2]!.className).toBe(BLOCKED_CLASS);
	});
});
