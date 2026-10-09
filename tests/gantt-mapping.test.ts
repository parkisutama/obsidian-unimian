import { describe, expect, it } from "vitest";
import type { EntrySnapshot } from "../src/core/entries/EntrySnapshot";
import type { NormalizedValue } from "../src/core/entries/NormalizedValue";
import type { EntrySnapshotGroup } from "../src/platform/bases/entrySnapshotAdapter";
import { getGanttViewOptions, readGanttOptions } from "../src/views/gantt/options";
import { mapSnapshotsToGanttTasks } from "../src/views/gantt/taskMapping";

const snapshot = (path: string, values: Record<string, NormalizedValue>): EntrySnapshot => ({
	path,
	basename: path.replace(/\.md$/, "").split("/").at(-1)!,
	extension: "md",
	folder: "",
	ctime: 1,
	mtime: 2,
	values: new Map(Object.entries(values)),
});
const date = (value: string, hasTime = false): NormalizedValue => ({
	kind: "date",
	value,
	hasTime,
});
const text = (value: string): NormalizedValue => ({ kind: "text", value });
const link = (target: string): NormalizedValue => ({
	kind: "link",
	target,
	display: null,
	external: false,
});
const number = (value: number): NormalizedValue => ({ kind: "number", value });
const group = (
	entries: EntrySnapshot[],
	key: NormalizedValue = { kind: "missing" },
): EntrySnapshotGroup => ({ entries, key });

function options(values: Record<string, unknown> = {}) {
	const config = {
		get: (key: string) => values[key],
		getAsPropertyId: (key: string) =>
			typeof values[key] === "string" && String(values[key]).includes(".") ? values[key] : null,
		getOrder: () => [],
		getDisplayName: (id: string) => id,
	};
	return readGanttOptions(config as never);
}
const services = {
	resolveLink: (target: string) => ({
		path: target.endsWith(".md") ? target : `${target}.md`,
		name: target.split("/").at(-1)!,
	}),
	resolveColor: (_entry: EntrySnapshot, category: string | null) =>
		category === "Urgent" ? "#ff0000" : null,
};

describe("Bases to Gantt task mapping (GBETA-008)", () => {
	it("defines every spec §3.6 option under Gantt-Beta-specific keys", () => {
		const serialized = JSON.stringify(getGanttViewOptions({} as never));
		for (const key of [
			"Start",
			"End",
			"Label",
			"Parent",
			"Order",
			"Progress",
			"ColorBy",
			"DependencyFS",
			"Scale",
			"ShowNonWorkingDays",
			"WorkingWeekdays",
			"Holidays",
			"SnapToWorkingDays",
			"FirstDayOfWeek",
			"ZoomOnWheel",
			"InfiniteScroll",
			"ScrollToToday",
			"Phases",
			"ShowTaskList",
			"ShowRowNumbers",
			"ShowDetail",
			"ShowProgress",
			"ShowTooltip",
			"RowHeight",
			"ReadOnly",
			"AllowMove",
			"AllowResize",
			"AllowProgress",
			"AllowLinkCreate",
			"AllowLinkDelete",
			"AllowReorder",
			"AllowTaskCreate",
			"DependencyShift",
			"WritePhaseDates",
			"TemplatePath",
			"TargetFolder",
			"TitleFormat",
		])
			expect(serialized).toContain(`gantt${key}`);
		expect(serialized).not.toMatch(/"key":"(?:type|name|filters|groupBy|order|summaries)"/);
	});
	it("maps every §3.2 task field and normalizes date/progress/dependencies", () => {
		const result = mapSnapshotsToGanttTasks(
			[
				group([
					snapshot("Tasks/A.md", {
						"note.start": date("2026-01-31"),
						"note.end": date("2026-02-02"),
						"note.label": text("Custom A"),
						"note.progress": text("125"),
						"note.color": text("Urgent"),
						"note.parent": link("Tasks/Parent"),
						"note.order": number(20),
						"note.depends": { kind: "list", items: [link("Tasks/B"), link("Tasks/C")] },
					}),
					snapshot("Tasks/Parent.md", { "note.start": date("2026-01-01") }),
				]),
			],
			options({
				ganttStart: "note.start",
				ganttEnd: "note.end",
				ganttLabel: "note.label",
				ganttProgress: "note.progress",
				ganttColorBy: "note.color",
				ganttParent: "note.parent",
				ganttOrder: "note.order",
				ganttDependencyFS: "note.depends",
				ganttReadOnly: false,
			}),
			services,
		);
		const task = result.tasks.find((item) => item.id === "Tasks/A.md")!;
		expect(task).toMatchObject({
			id: "Tasks/A.md",
			name: "Custom A",
			startDate: "2026-01-31",
			endDate: "2026-02-03",
			progress: 100,
			color: "#ff0000",
			parentId: "Tasks/Parent.md",
			sequence: "1.1",
		});
		expect(task.dependencies).toEqual([
			{ targetId: "Tasks/B.md", type: "FS" },
			{ targetId: "Tasks/C.md", type: "FS" },
		]);
	});

	// A text value stored in a List-type property comes back from Bases as one item holding every link.
	it("reads two dependencies out of a single list item", () => {
		const result = mapSnapshotsToGanttTasks(
			[
				group([
					snapshot("Tasks/A.md", { "note.start": date("2026-01-01") }),
					snapshot("Tasks/B.md", { "note.start": date("2026-01-02") }),
					snapshot("Tasks/C.md", {
						"note.start": date("2026-01-03"),
						"note.depends": { kind: "list", items: [text("[[Tasks/A]], [[Tasks/B]]")] },
					}),
				]),
			],
			options({ ganttStart: "note.start", ganttDependencyFS: "note.depends" }),
			services,
		);

		expect(result.tasks.find((item) => item.id === "Tasks/C.md")?.dependencies).toEqual([
			{ targetId: "Tasks/A.md", type: "FS" },
			{ targetId: "Tasks/B.md", type: "FS" },
		]);
	});

	it("lists dependency links that name no note so the view can say so", () => {
		const result = mapSnapshotsToGanttTasks(
			[
				group([
					snapshot("Tasks/A.md", { "note.start": date("2026-01-01") }),
					snapshot("Tasks/B.md", {
						"note.start": date("2026-01-02"),
						"note.depends": { kind: "list", items: [link("Tasks/A"), link("Deleted note")] },
					}),
				]),
			],
			options({ ganttStart: "note.start", ganttDependencyFS: "note.depends" }),
			{
				...services,
				resolveLink: (target: string) =>
					target === "Deleted note" ? null : services.resolveLink(target),
			},
		);

		expect(result.unresolved).toEqual([{ path: "Tasks/B.md", target: "Deleted note" }]);
		expect(result.tasks.find((item) => item.id === "Tasks/B.md")?.dependencies).toEqual([
			{ targetId: "Tasks/A.md", type: "FS" },
		]);
	});

	it("keeps the stable FS config key while presenting the relation as Depends on", () => {
		const value = options({ ganttDependencyFS: "note.fs" });
		expect(value.dependsOn).toBe("note.fs");
		expect(value.dependencyShift).toBe("none");
		const schema = JSON.stringify(getGanttViewOptions({} as never));
		expect(schema).toContain('"key":"ganttDependencyFS","displayName":"Depends on"');
	});

	it("uses basename, supplies one scale step for missing end, and lists missing-start entries", () => {
		const result = mapSnapshotsToGanttTasks(
			[
				group([
					snapshot("Alpha.md", { "note.start": date("2026-03-08T01:30", true) }),
					snapshot("Unscheduled.md", { "note.label": text("Waiting") }),
				]),
			],
			options({ ganttStart: "note.start", ganttScale: "day" }),
			services,
		);
		expect(result.tasks[0]).toMatchObject({
			name: "Alpha",
			startDate: "2026-03-08T01:30",
			endDate: "2026-03-09T01:30",
		});
		expect(result.unscheduled.map((entry) => entry.path)).toEqual(["Unscheduled.md"]);
	});

	it("renders grouped and external parents as read-only synthetic phases", () => {
		const result = mapSnapshotsToGanttTasks(
			[
				group(
					[
						snapshot("Child.md", {
							"note.start": date("2026-01-01"),
							"note.parent": link("Outside"),
						}),
					],
					text("Group A"),
				),
			],
			options({ ganttStart: "note.start", ganttParent: "note.parent" }),
			services,
			true,
		);
		expect(result.tasks.map((task) => task.name)).toEqual(["Group A", "Outside", "Child"]);
		expect(result.tasks.slice(0, 2).every((task) => task.readOnly)).toBe(true);
		expect(result.tasks[2]?.parentId).toBe(result.tasks[1]?.id);
	});

	it("disables date interactions for formula-backed properties and omits hidden progress", () => {
		const result = mapSnapshotsToGanttTasks(
			[
				group([
					snapshot("A.md", {
						"formula.start": date("2026-01-01"),
						"note.progress": number(50),
					}),
				]),
			],
			options({
				ganttStart: "formula.start",
				ganttProgress: "note.progress",
				ganttShowProgress: false,
			}),
			services,
		);
		expect(result.tasks[0]).toMatchObject({ allowMove: false, allowResize: false });
		expect(result.tasks[0]).not.toHaveProperty("progress");
	});
});
