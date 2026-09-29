import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/types/settings";
import type UnimianPlugin from "../src/main";
import { createCalendarOptions } from "../src/views/calendar/options";
import {
	configuredKinds,
	PERIODIC_KINDS,
	periodicKeys,
	readPeriodicConfig,
	WEEK_NUMBERING_KEY,
} from "../src/views/calendar/periodic/config";
import { ISO_WEEK } from "../src/views/calendar/periodic/resolver";

const read = (values: Record<string, unknown>, weekStartsOn = 1) =>
	readPeriodicConfig((key) => values[key], weekStartsOn);

/** Every option key, flattened out of groups. */
const collectKeys = (options: unknown[]): string[] =>
	options.flatMap((option) => {
		const o = option as { key?: string; items?: unknown[] };
		return [...(o.key ? [o.key] : []), ...(o.items ? collectKeys(o.items) : [])];
	});

describe("periodic config", () => {
	it("is entirely unconfigured for a view that sets nothing", () => {
		const config = read({});
		expect(configuredKinds(config)).toEqual([]);
		expect(config.weekRule).toEqual(ISO_WEEK);
		for (const kind of PERIODIC_KINDS) expect(config.periods[kind]).toEqual({ pattern: "", template: "" });
	});

	it("configures only the periods that have a pattern, trimmed", () => {
		const config = read({
			[periodicKeys("day").path]: "  timeline/YYYY/YYYY-MM/YYYY-MM-DD ",
			[periodicKeys("day").template]: "templates/timeline/daily.md",
			[periodicKeys("week").template]: "templates/timeline/weekly.md", // template without a pattern
			[periodicKeys("year").path]: 42, // wrong type is ignored
		});
		expect(configuredKinds(config)).toEqual(["day"]);
		expect(config.periods.day).toEqual({
			pattern: "timeline/YYYY/YYYY-MM/YYYY-MM-DD",
			template: "templates/timeline/daily.md",
		});
		expect(config.periods.year.pattern).toBe("");
	});

	it("uses ISO weeks unless locale numbering is chosen", () => {
		expect(read({ [WEEK_NUMBERING_KEY]: "iso" }, 0).weekRule).toEqual(ISO_WEEK);
		expect(read({ [WEEK_NUMBERING_KEY]: "nonsense" }, 0).weekRule).toEqual(ISO_WEEK);
		expect(read({ [WEEK_NUMBERING_KEY]: "locale" }, 0).weekRule).toEqual({ firstDay: 0, minDays: 1 });
	});
});

describe("calendar options schema", () => {
	const plugin = { app: {}, settings: structuredClone(DEFAULT_SETTINGS) } as unknown as UnimianPlugin;
	const keys = collectKeys(createCalendarOptions(plugin));

	it("keeps every existing key", () => {
		expect(keys).toEqual(expect.arrayContaining([
			"weekStartsOn", "fontSize", "defaultView", "colorBy", "titleField", "dateStartField",
			"dateEndField", "allDayField", "templatePath", "targetFolder", "titleFormat",
			"yearContinuousRowHeight", "yearSplitRowHeight",
		]));
	});

	it("adds a path and a template key for each period, all prefixed and unique", () => {
		const periodic = keys.filter((key) => key.startsWith("periodic"));
		expect(periodic).toEqual(expect.arrayContaining(
			PERIODIC_KINDS.flatMap((kind) => [periodicKeys(kind).path, periodicKeys(kind).template]),
		));
		expect(periodic).toContain(WEEK_NUMBERING_KEY);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("does not preselect any period pattern or template", () => {
		const defaults = (createCalendarOptions(plugin) as Array<{ items?: Array<{ key?: string; default?: unknown }> }>)
			.flatMap((option) => option.items ?? [])
			.filter((item) => item.key?.startsWith("periodic") && item.key !== WEEK_NUMBERING_KEY)
			.map((item) => item.default);
		expect(defaults.every((value) => value === "")).toBe(true);
	});
});
