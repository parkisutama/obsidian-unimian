import { describe, expect, it } from "vitest";
import type { EntrySnapshot } from "../src/core/entries/EntrySnapshot";
import { MISSING_VALUE } from "../src/core/entries/NormalizedValue";
import type { DateOnlyValue } from "../src/core/temporal/TemporalValue";
import {
	buildTimelineModel as buildTimelineModelFromGroups,
	flattenTimelineRows,
} from "../src/views/timeline/TimelineModel";
import {
	type TimelineOptions,
	timelineRequestedProperties,
} from "../src/views/timeline/timelineOptions";
import { date, text, timelineSnapshot } from "./fixtures/timeline";

const options: TimelineOptions = {
	startProperty: "note.begins",
	endProperty: "note.finishes",
	titleProperty: "note.caption",
	colorProperty: "note.category",
	wrapTitles: false,
	zoom: "month",
};

function buildTimelineModel(
	entries: readonly EntrySnapshot[],
	timelineOptions: TimelineOptions,
	today?: DateOnlyValue,
) {
	const grouped = new Map<string, EntrySnapshot[]>();
	for (const entry of entries) {
		const owner = entry.values.get("note.owner");
		const key = owner?.kind === "text" ? owner.value : "";
		const group = grouped.get(key) ?? [];
		group.push(entry);
		grouped.set(key, group);
	}
	return buildTimelineModelFromGroups(
		[...grouped].map(([key, groupEntries]) => ({
			key: key ? text(key) : MISSING_VALUE,
			entries: groupEntries,
		})),
		timelineOptions,
		today,
	);
}

describe("Timeline model", () => {
	it("maps arbitrary configured properties without a required schema", () => {
		const model = buildTimelineModel(
			[
				timelineSnapshot("Notes/A.md", {
					"note.begins": date("2026-01-01"),
					"note.finishes": date("2026-01-03"),
					"note.caption": text("Alpha"),
					"note.category": text("Research"),
					"note.owner": text("Team A"),
				}),
			],
			options,
		);
		expect(model.groups[0]).toMatchObject({
			key: "text:Team A",
			items: [{ path: "Notes/A.md", title: "Alpha", colorValue: "Research" }],
		});
		expect(model.groups[0]?.items[0]?.range?.endExclusive?.iso).toBe("2026-01-04");
	});

	it("preserves first-seen group and item order", () => {
		const entries = [
			timelineSnapshot("B.md", { "note.begins": date("2026-01-02"), "note.owner": text("Second") }),
			timelineSnapshot("A.md", { "note.begins": date("2026-01-01"), "note.owner": text("First") }),
			timelineSnapshot("C.md", { "note.begins": date("2026-01-03"), "note.owner": text("Second") }),
		];
		const model = buildTimelineModel(entries, options);
		expect(model.groups.map((group) => group.key)).toEqual(["text:Second", "text:First"]);
		expect(model.groups[0]?.items.map((item) => item.path)).toEqual(["B.md", "C.md"]);
	});

	it("preserves the Bases-provided sort order through model and flattened rows", () => {
		const alpha = timelineSnapshot("Alpha.md", {
			"note.begins": date("2026-01-01"),
			"note.owner": text("Team"),
		});
		const beta = timelineSnapshot("Beta.md", {
			"note.begins": date("2026-01-02"),
			"note.owner": text("Team"),
		});

		for (const basesSortedEntries of [
			[alpha, beta],
			[beta, alpha],
		]) {
			const model = buildTimelineModel(basesSortedEntries, options);
			const expectedPaths = basesSortedEntries.map((entry) => entry.path);

			expect(model.groups[0]?.items.map((item) => item.path)).toEqual(expectedPaths);
			expect(
				flattenTimelineRows(model)
					.filter((row) => row.kind === "item")
					.map((row) => row.path),
			).toEqual(expectedPaths);
		}
	});

	it("routes missing and invalid dates to unscheduled with explicit reasons", () => {
		const entries = [
			timelineSnapshot("Missing.md", {}),
			timelineSnapshot("BadStart.md", { "note.begins": text("tomorrow") }),
			timelineSnapshot("BadEnd.md", {
				"note.begins": date("2026-01-01"),
				"note.finishes": text("later"),
			}),
		];
		const model = buildTimelineModel(entries, options);
		expect(model.groups).toHaveLength(1);
		expect(model.groups[0]?.items.map((item) => item.path)).toEqual([
			"Missing.md",
			"BadStart.md",
			"BadEnd.md",
		]);
		expect(model.unscheduled.map((item) => [item.path, item.unscheduledReason])).toEqual([
			["Missing.md", "start-missing"],
			["BadStart.md", "start-invalid"],
			["BadEnd.md", "end-invalid"],
		]);
	});

	it("treats an unconfigured start property as configuration state, not unscheduled data", () => {
		const model = buildTimelineModel([timelineSnapshot("A.md", {})], {
			...options,
			startProperty: null,
		});
		expect(model.startConfigured).toBe(false);
		expect(model.unscheduled).toEqual([]);
		expect(flattenTimelineRows(model)).toEqual([]);
	});

	it("uses basename and no group header when native grouping is absent", () => {
		const model = buildTimelineModel(
			[timelineSnapshot("Folder/Fallback.md", { "note.begins": date("2026-01-01") })],
			options,
		);
		expect(model.groups[0]).toMatchObject({ label: null, items: [{ title: "Fallback" }] });
	});

	it("requests only configured properties and contains no workflow ranking", () => {
		expect(timelineRequestedProperties(options)).toEqual([
			"note.begins",
			"note.finishes",
			"note.caption",
			"note.category",
		]);
		const model = buildTimelineModel([], options) as unknown as Record<string, unknown>;
		expect(model).not.toHaveProperty("statusOrder");
		expect(model).not.toHaveProperty("priorityRanking");
	});

	it("keeps scheduled and unscheduled items together in their configured group", () => {
		const model = buildTimelineModel(
			[
				timelineSnapshot("A.md", { "note.begins": date("2026-01-01"), "note.owner": text("Team") }),
				timelineSnapshot("B.md", { "note.owner": text("Team") }),
			],
			options,
		);
		expect(flattenTimelineRows(model).map((row) => [row.kind, row.path])).toEqual([
			["group", "unimian-timeline-group:text%3ATeam"],
			["item", "A.md"],
			["item", "B.md"],
		]);
		expect(flattenTimelineRows(model, new Set(["text:Team"])).map((row) => row.kind)).toEqual([
			"group",
		]);
	});

	it("does not render a synthetic group header when Bases grouping is not configured", () => {
		const model = buildTimelineModelFromGroups(
			[
				{
					key: MISSING_VALUE,
					entries: [
						timelineSnapshot("A.md", { "note.begins": date("2026-01-01") }),
						timelineSnapshot("B.md", {}),
					],
				},
			],
			options,
		);
		expect(flattenTimelineRows(model).map((row) => [row.kind, row.path])).toEqual([
			["item", "A.md"],
			["item", "B.md"],
		]);
	});
});
