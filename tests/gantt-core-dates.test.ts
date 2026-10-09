// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readGanttDate, writeGanttDate } from "../src/core/gantt/dates";
import { parseGanttProgress } from "../src/core/gantt/progress";

const originalTimezone = process.env.TZ;

beforeAll(() => {
	process.env.TZ = "America/New_York";
});

afterAll(() => {
	if (originalTimezone === undefined) delete process.env.TZ;
	else process.env.TZ = originalTimezone;
});

describe("Gantt floating dates (GBETA-005)", () => {
	it.each(["2026-01-31", "2026-02-28", "2024-02-29", "2026-12-31", "2026-03-08", "2026-11-01"])(
		"round-trips the inclusive Date end %s through the exclusive library end",
		(propertyEnd) => {
			const libraryEnd = readGanttDate(propertyEnd, "date", "end");
			expect(libraryEnd).not.toBe(propertyEnd);
			expect(writeGanttDate(libraryEnd, "date", "end")).toBe(propertyEnd);
		},
	);

	it.each(["2026-01-31T23:59", "2024-02-29T12:15", "2026-03-08T02:30", "2026-11-01T01:30"])(
		"round-trips floating Date & time without DST or month drift: %s",
		(propertyValue) => {
			const libraryValue = readGanttDate(propertyValue, "datetime", "end");
			expect(writeGanttDate(libraryValue, "datetime", "end")).toBe(propertyValue);
		},
	);

	it("runs the boundary cases in an explicitly non-UTC test timezone", () => {
		expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/New_York");
		expect(new Date("2026-01-01T00:00:00Z").getTimezoneOffset()).not.toBe(0);
	});

	it("keeps Date starts unchanged and rejects incompatible or invalid values", () => {
		expect(readGanttDate("2026-09-19", "date", "start")).toBe("2026-09-19");
		expect(writeGanttDate("2026-09-19", "date", "start")).toBe("2026-09-19");
		expect(readGanttDate("2026-02-30", "date", "start")).toBeNull();
		expect(readGanttDate("2026-09-19T10:00", "date", "start")).toBeNull();
		expect(readGanttDate("not a date", "datetime", "start")).toBeNull();
	});

	it.each(["2026-01-01T05:30:00Z", "2026-01-01T00:30:00-05:00"])(
		"converts zoned input to local floating time and never writes an offset: %s",
		(input) => {
			const expected = "2026-01-01T00:30";
			const libraryValue = readGanttDate(input, "datetime", "start");
			expect(libraryValue).toBe(expected);
			const written = writeGanttDate(libraryValue, "datetime", "start");
			expect(written).toBe(expected);
			expect(written).not.toMatch(/Z|[+-]\d{2}:\d{2}$/);
		},
	);
});

describe("Gantt chart output to property values", () => {
	// The library keeps floating time in UTC and reports edits as ISO strings ending in Z.
	it.each(["America/New_York", "Asia/Jakarta", "Australia/Lord_Howe", "UTC"])(
		"writes chart Date & time output as the same wall-clock time in %s",
		(zone) => {
			process.env.TZ = zone;
			expect(writeGanttDate("2026-10-02T09:00:00.000Z", "datetime", "start")).toBe(
				"2026-10-02T09:00",
			);
			expect(writeGanttDate("2026-10-02T23:59:00.000Z", "datetime", "end")).toBe(
				"2026-10-02T23:59",
			);
			expect(writeGanttDate("2026-10-02T09:00", "datetime", "start")).toBe("2026-10-02T09:00");
			process.env.TZ = "America/New_York";
		},
	);

	it("writes a moved Date task from the ISO strings the library emits", () => {
		expect(writeGanttDate("2026-10-02T00:00:00.000Z", "date", "start")).toBe("2026-10-02");
		expect(writeGanttDate("2026-10-05T00:00:00.000Z", "date", "end")).toBe("2026-10-04");
		expect(writeGanttDate("2026-10-05", "date", "end")).toBe("2026-10-04");
	});

	it("keeps the chart end exclusive even when the library emits a sub-day time", () => {
		expect(writeGanttDate("2026-10-05T12:00:00.000Z", "date", "end")).toBe("2026-10-04");
		expect(writeGanttDate("2026-10-08T06:00:00.000Z", "date", "end")).toBe("2026-10-07");
	});

	it("crosses month and year boundaries for exclusive ends", () => {
		expect(writeGanttDate("2026-11-01T00:00:00.000Z", "date", "end")).toBe("2026-10-31");
		expect(writeGanttDate("2027-01-01T00:00:00.000Z", "date", "end")).toBe("2026-12-31");
		expect(writeGanttDate("2024-03-01T00:00:00.000Z", "date", "end")).toBe("2024-02-29");
	});

	it("rejects values that are not chart dates", () => {
		expect(writeGanttDate(undefined, "date", "start")).toBeNull();
		expect(writeGanttDate("2026-02-30T00:00:00.000Z", "date", "start")).toBeNull();
		expect(writeGanttDate("soon", "datetime", "start")).toBeNull();
	});
});

describe("Gantt progress conversion (GBETA-005)", () => {
	it.each([
		[0, 0],
		[42.5, 42.5],
		["75", 75],
		[-1, 0],
		["101", 100],
	])("parses and clamps %j to %s", (input, expected) => {
		expect(parseGanttProgress(input)).toBe(expected);
	});

	it.each([
		null,
		undefined,
		"",
		" ",
		"not a number",
		Number.NaN,
		Number.POSITIVE_INFINITY,
		true,
		{},
	])("omits unusable progress %j", (input) => {
		expect(parseGanttProgress(input)).toBeUndefined();
	});

	it("omits progress when display is disabled", () => {
		expect(parseGanttProgress(50, false)).toBeUndefined();
	});
});
