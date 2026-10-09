import type { Task } from "@jaeungkim/gantt-chart";
import { describe, expect, it } from "vitest";
import { applyGanttDependencyPolicy } from "../src/core/gantt/cascade";

const task = (
	id: string,
	startDate: string,
	endDate: string,
	predecessors: string[] = [],
): Task => ({
	id,
	name: id,
	startDate,
	endDate,
	parentId: null,
	sequence: id,
	...(predecessors.length
		? { dependencies: predecessors.map((targetId) => ({ targetId, type: "FS" as const })) }
		: {}),
});

const byId = (tasks: Task[], id: string) => tasks.find((item) => item.id === id)!;

describe("Gantt dependency schedule policy (GBETA-011)", () => {
	it("does not alter successors when automatic shifting is off", () => {
		const before = [
			task("A", "2026-10-01", "2026-10-03"),
			task("B", "2026-10-05", "2026-10-07", ["A"]),
		];
		const after = [{ ...before[0]!, startDate: "2026-10-03", endDate: "2026-10-05" }, before[1]!];

		const result = applyGanttDependencyPolicy(before, after, "none");
		expect(result).toBe(after);
	});

	it("repairs only an overlap and preserves the successor duration", () => {
		const before = [
			task("A", "2026-10-01", "2026-10-03"),
			task("B", "2026-10-04", "2026-10-07", ["A"]),
		];
		const after = [{ ...before[0]!, startDate: "2026-10-04", endDate: "2026-10-06" }, before[1]!];

		const result = applyGanttDependencyPolicy(before, after, "overlap");
		expect(byId(result, "B")).toMatchObject({ startDate: "2026-10-06", endDate: "2026-10-09" });
	});

	it("repairs overlap once per link through a chain", () => {
		const before = [
			task("A", "2026-10-01", "2026-10-03"),
			task("B", "2026-10-03", "2026-10-05", ["A"]),
			task("C", "2026-10-05", "2026-10-07", ["B"]),
		];
		const after = [
			{ ...before[0]!, startDate: "2026-10-03", endDate: "2026-10-05" },
			before[1]!,
			before[2]!,
		];

		const result = applyGanttDependencyPolicy(before, after, "overlap");
		expect(byId(result, "B")).toMatchObject({ startDate: "2026-10-05", endDate: "2026-10-07" });
		expect(byId(result, "C")).toMatchObject({ startDate: "2026-10-07", endDate: "2026-10-09" });
	});

	it("keeps an existing positive gap unchanged through a chain", () => {
		const before = [
			task("A", "2026-10-01", "2026-10-03"),
			task("B", "2026-10-05", "2026-10-07", ["A"]),
			task("C", "2026-10-10", "2026-10-11", ["B"]),
		];
		const after = [
			{ ...before[0]!, startDate: "2026-10-04", endDate: "2026-10-06" },
			before[1]!,
			before[2]!,
		];

		const result = applyGanttDependencyPolicy(before, after, "maintain-gap");
		expect(byId(result, "B")).toMatchObject({ startDate: "2026-10-08", endDate: "2026-10-10" });
		expect(byId(result, "C")).toMatchObject({ startDate: "2026-10-13", endDate: "2026-10-14" });
	});

	it("uses the latest required start at a diamond join", () => {
		const before = [
			task("A", "2026-10-01", "2026-10-02"),
			task("B", "2026-10-03", "2026-10-05", ["A"]),
			task("C", "2026-10-03", "2026-10-05", ["A"]),
			task("D", "2026-10-06", "2026-10-08", ["B", "C"]),
		];
		const after = [
			{ ...before[0]!, startDate: "2026-10-03", endDate: "2026-10-04" },
			before[1]!,
			{ ...before[2]!, startDate: "2026-10-07", endDate: "2026-10-09" },
			before[3]!,
		];

		const result = applyGanttDependencyPolicy(before, after, "maintain-gap");
		expect(byId(result, "B").startDate).toBe("2026-10-05");
		expect(byId(result, "C").startDate).toBe("2026-10-07");
		expect(byId(result, "D")).toMatchObject({ startDate: "2026-10-10", endDate: "2026-10-12" });
	});

	it("terminates on a cycle and shifts each non-direct task at most once", () => {
		const before = [
			task("A", "2026-10-01", "2026-10-02", ["C"]),
			task("B", "2026-10-03", "2026-10-04", ["A"]),
			task("C", "2026-10-05", "2026-10-06", ["B"]),
		];
		const after = [
			{ ...before[0]!, startDate: "2026-10-02", endDate: "2026-10-03" },
			before[1]!,
			before[2]!,
		];

		const result = applyGanttDependencyPolicy(before, after, "maintain-gap");
		expect(byId(result, "A").startDate).toBe("2026-10-02");
		expect(byId(result, "B")).toMatchObject({ startDate: "2026-10-04", endDate: "2026-10-05" });
		expect(byId(result, "C")).toMatchObject({ startDate: "2026-10-06", endDate: "2026-10-07" });
	});
});
