import { describe, expect, it } from "vitest";
import {
	formatPeriodicTokens,
	ISO_WEEK,
	periodStart,
	resolvePeriodicPath,
	weekInfo,
	type WeekRule,
} from "../src/views/calendar/periodic/resolver";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const US_WEEK: WeekRule = { firstDay: 0, minDays: 1 };

describe("ISO 8601 weeks (GGGG / WW)", () => {
	// [date, ISO week-year, ISO week]
	const cases: Array<[Date, number, number]> = [
		[d(2026, 9, 21), 2026, 39],
		[d(2024, 12, 29), 2024, 52], // Sunday, still last week of 2024
		[d(2024, 12, 30), 2025, 1], // Monday of the week holding 2 Jan 2025 (Thursday)
		[d(2021, 1, 1), 2020, 53], // Friday
		[d(2021, 1, 3), 2020, 53], // Sunday
		[d(2021, 1, 4), 2021, 1],
		[d(2026, 1, 1), 2026, 1], // Thursday
		[d(2026, 12, 31), 2026, 53], // 2026 has 53 ISO weeks
		[d(2027, 1, 1), 2026, 53],
		[d(2027, 1, 3), 2026, 53],
		[d(2027, 1, 4), 2027, 1],
		[d(2020, 12, 31), 2020, 53],
		[d(2024, 2, 29), 2024, 9], // leap day
	];
	it.each(cases)("%s -> %i-W%i", (date, year, week) => {
		expect(weekInfo(date, ISO_WEEK)).toEqual({ year, week });
	});

	it("formats GGGG-[W]WW independent of the locale week rule", () => {
		expect(formatPeriodicTokens("GGGG-[W]WW", d(2024, 12, 30), US_WEEK)).toBe("2025-W01");
	});
});

describe("locale weeks (gggg / ww)", () => {
	it("matches ISO when the rule is Monday / 4", () => {
		expect(formatPeriodicTokens("gggg-[W]ww", d(2021, 1, 3), ISO_WEEK)).toBe("2020-W53");
	});

	it("uses Sunday start and the week containing 1 January for the US rule", () => {
		// Sunday 29 Dec 2024 starts the week that contains 1 Jan 2025.
		expect(weekInfo(d(2024, 12, 29), US_WEEK)).toEqual({ year: 2025, week: 1 });
		expect(weekInfo(d(2025, 1, 4), US_WEEK)).toEqual({ year: 2025, week: 1 });
		expect(weekInfo(d(2025, 1, 5), US_WEEK)).toEqual({ year: 2025, week: 2 });
		expect(weekInfo(d(2024, 12, 28), US_WEEK)).toEqual({ year: 2024, week: 52 });
	});
});

describe("tokens", () => {
	const date = d(2026, 9, 5); // Saturday
	const allTokens: Array<[string, string]> = [
		["YYYY", "2026"], ["GGGG", "2026"], ["gggg", "2026"], ["MMMM", "September"],
		["dddd", "Saturday"], ["MMM", "Sep"], ["ddd", "Sat"], ["YY", "26"],
		["MM", "09"], ["DD", "05"], ["WW", "36"], ["ww", "36"], ["M", "9"],
		["D", "5"], ["Q", "3"], ["W", "36"], ["w", "36"],
	];

	it.each([
		["YYYY-MM-DD", "2026-09-05"],
		["YY/M/D", "26/9/5"],
		["MMMM MMM", "September Sep"],
		["dddd ddd", "Saturday Sat"],
		["YYYY-[Q]Q", "2026-Q3"],
		["[Week] W", "Week 36"],
		["YYYY/YYYY-MM/YYYY-MM-DD", "2026/2026-09/2026-09-05"],
		["[YYYY] YYYY", "YYYY 2026"],
		["[unclosed YYYY", "[unclosed 2026"],
	])("%s -> %s", (pattern, expected) => {
		expect(formatPeriodicTokens(pattern, date)).toBe(expected);
	});

	it.each(allTokens)("formats supported token %s", (token, expected) => {
		expect(formatPeriodicTokens(token, date)).toBe(expected);
	});

	it.each(allTokens)("keeps supported token %s literal inside ordinary words", (token) => {
		const word = `prefix${token}suffix`;
		expect(formatPeriodicTokens(word, date)).toBe(word);
	});

	it("pads a year below 1000 to four digits", () => {
		expect(formatPeriodicTokens("YYYY", new Date(999, 0, 1))).toBe("0999");
	});
});

describe("quarters", () => {
	it.each([
		[d(2026, 1, 1), "1"],
		[d(2026, 3, 31), "1"],
		[d(2026, 4, 1), "2"],
		[d(2026, 9, 30), "3"],
		[d(2026, 10, 1), "4"],
		[d(2026, 12, 31), "4"],
	])("%s is quarter %s", (date, quarter) => {
		expect(formatPeriodicTokens("Q", date)).toBe(quarter);
	});
});

describe("periodStart", () => {
	it("returns the first day of each period", () => {
		const date = d(2026, 9, 23); // Wednesday
		expect(periodStart(date, "day")).toEqual(d(2026, 9, 23));
		expect(periodStart(date, "week")).toEqual(d(2026, 9, 21));
		expect(periodStart(date, "month")).toEqual(d(2026, 9, 1));
		expect(periodStart(date, "quarter")).toEqual(d(2026, 7, 1));
		expect(periodStart(date, "year")).toEqual(d(2026, 1, 1));
	});

	it("honors a Sunday week start and crosses a year boundary", () => {
		expect(periodStart(d(2025, 1, 1), "week", US_WEEK)).toEqual(d(2024, 12, 29));
		expect(periodStart(d(2025, 1, 1), "week")).toEqual(d(2024, 12, 30));
	});
});

describe("resolvePeriodicPath", () => {
	it("resolves a day to folder, name, and path, including a future date", () => {
		expect(resolvePeriodicPath(d(2026, 9, 22), "timeline/YYYY/YYYY-MM/YYYY-MM-DD")).toEqual({
			ok: true,
			path: "timeline/2026/2026-09/2026-09-22.md",
			folder: "timeline/2026/2026-09",
			name: "2026-09-22",
		});
		expect(resolvePeriodicPath(d(2031, 1, 1), "YYYY-MM-DD")).toMatchObject({
			ok: true,
			path: "2031-01-01.md",
			folder: "",
		});
	});

	it("resolves the ISO preset patterns for every period", () => {
		const date = d(2026, 9, 21);
		const presets = {
			day: "timeline/YYYY/YYYY-MM/YYYY-MM-DD",
			week: "timeline/GGGG/GGGG-[W]WW",
			month: "timeline/YYYY/YYYY-MM",
			quarter: "timeline/YYYY/YYYY-[Q]Q",
			year: "timeline/YYYY",
		};
		const paths = Object.fromEntries(
			Object.entries(presets).map(([kind, pattern]) => {
				const result = resolvePeriodicPath(date, pattern);
				return [kind, result.ok ? result.path : result.reason];
			}),
		);
		expect(paths).toEqual({
			day: "timeline/2026/2026-09/2026-09-21.md",
			week: "timeline/2026/2026-W39.md",
			month: "timeline/2026/2026-09.md",
			quarter: "timeline/2026/2026-Q3.md",
			year: "timeline/2026.md",
		});
	});

	it("resolves a year-boundary week into the ISO week-year's folder", () => {
		expect(resolvePeriodicPath(d(2024, 12, 30), "GGGG/GGGG-[W]WW")).toMatchObject({
			path: "2025/2025-W01.md",
		});
	});

	it.each([
		["", "empty"],
		["   ", "empty"],
		["/YYYY/YYYY-MM-DD", "absolute"],
		["../YYYY-MM-DD", ".."],
		["YYYY/../YYYY-MM-DD", ".."],
		["YYYY//YYYY-MM-DD", "empty segment"],
		["YYYY/", "trailing slash"],
		["YYYY\\YYYY-MM-DD", "backslash"],
		["YYYY:MM", "colon"],
		["[a*b] YYYY", "asterisk"],
	])("refuses %j (%s)", (pattern) => {
		expect(resolvePeriodicPath(d(2026, 9, 21), pattern)).toMatchObject({ ok: false });
	});
});
