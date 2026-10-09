import { describe, expect, it } from "vitest";
import { createSwimlaneOptions } from "../src/views/swimlane/options";
import { orderKeys, parseCustomOrder, reorderKeys } from "../src/views/swimlane/ordering";
import { formatDate, looksLikeDateString, valueToString } from "../src/views/swimlane/values";

describe("swimlane ordering", () => {
	it("defaults to an alphabetical order (deliberately not Bases' own sort)", () => {
		expect(orderKeys(["Todo", "Done", "Doing"], [])).toEqual(["Doing", "Done", "Todo"]);
		expect(
			orderKeys(
				new Map([
					["b", 1],
					["a", 2],
				]).keys(),
				[],
			),
		).toEqual(["a", "b"]);
	});

	it("respects a saved order, drops stale keys, and appends new keys alphabetically", () => {
		expect(orderKeys(["a", "b", "c", "d"], ["c", "gone", "a"])).toEqual(["c", "a", "b", "d"]);
	});

	it("parses persisted order defensively", () => {
		expect(parseCustomOrder(undefined)).toEqual([]);
		expect(parseCustomOrder("not json")).toEqual([]);
		expect(parseCustomOrder('{"a":1}')).toEqual([]);
		expect(parseCustomOrder('["a",1,"b"]')).toEqual(["a", "b"]);
	});

	it("moves a key before or after its target", () => {
		expect(reorderKeys(["a", "b", "c"], "c", "a", true)).toEqual(["c", "a", "b"]);
		expect(reorderKeys(["a", "b", "c"], "a", "b", false)).toEqual(["b", "a", "c"]);
	});
});

describe("swimlane values", () => {
	it("stringifies group values", () => {
		expect(valueToString(null)).toBe("None");
		expect(valueToString([])).toBe("None");
		expect(valueToString(["x", "", "y"])).toBe("x, y");
		expect(valueToString(3)).toBe("3");
		expect(valueToString({ a: 1 })).toBe('{"a":1}');
	});

	it("detects ISO date strings and formats them", () => {
		expect(looksLikeDateString("2026-02-22")).toBe(true);
		expect(looksLikeDateString("2026-02-22T17:35:12+07:00")).toBe(true);
		expect(looksLikeDateString("Ship it")).toBe(false);
		expect(formatDate("nope")).toBeNull();
		expect(formatDate(undefined)).toBeNull();
		expect(formatDate(new Date(Date.now() + 86400000 * 3), "relative")).toBe("in 3d");
	});
});

describe("swimlane options schema", () => {
	it("keeps its persisted keys stable and avoids Bases-reserved ones", () => {
		const keys = createSwimlaneOptions({} as never).map((o) => ("key" in o ? o.key : ""));
		expect(keys).toEqual([
			"plannerGroupBy",
			"swimlaneBy",
			"colorBy",
			"titleBy",
			"borderStyle",
			"coverField",
			"coverDisplay",
			"coverHeight",
			"summaryField",
			"dateStartField",
			"dateEndField",
			"dateFormat",
			"badgePlacement",
			"columnWidth",
			"hideEmptyColumns",
			"freezeHeaders",
			"swimHeaderDisplay",
			"showPropertyLabels",
		]);
		expect(keys).not.toContain("order");
		expect(keys).not.toContain("sort");
	});
});
