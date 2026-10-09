// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { describe, expect, it } from "vitest";
import { parseTemporalValue } from "../src/core/temporal/TemporalValue";
import type { TimeDomain } from "../src/core/temporal/TimeDomain";
import {
	dateToPixel,
	generateTimelineTicks,
	pixelToDayIndex,
	TIMELINE_ZOOM_SPECS,
	type TimelineZoom,
} from "../src/core/temporal/TimelineScale";

const date = (text: string) => {
	const value = parseTemporalValue(text);
	if (value?.kind !== "date") throw new Error(`Expected date: ${text}`);
	return value;
};

describe("timeline scales", () => {
	const start = date("2026-01-01");
	const end = date("2027-02-01");
	const domain: TimeDomain = {
		startDay: start.dayIndex,
		endDay: end.dayIndex,
		spanDays: end.dayIndex - start.dayIndex,
	};

	it.each(Object.keys(TIMELINE_ZOOM_SPECS) as TimelineZoom[])(
		"round-trips coordinates at %s zoom",
		(zoom) => {
			const day = start.dayIndex + 123.375;
			const pixel = dateToPixel(day, domain, zoom);
			expect(pixelToDayIndex(pixel, domain, zoom)).toBeCloseTo(day, 10);
			expect(pixelToDayIndex(pixel, domain, zoom, "nearest")).toBe(Math.round(day));
		},
	);

	it.each([
		["day", ["2026-01-01", "2026-01-02", "2026-01-03"]],
		["week", ["2026-01-05", "2026-01-12", "2026-01-19"]],
		["month", ["2026-01-01", "2026-02-01", "2026-03-01"]],
		["quarter", ["2026-01-01", "2026-04-01", "2026-07-01"]],
		["year", ["2026-01-01", "2027-01-01"]],
	] as const)("generates deterministic %s ticks", (zoom, expected) => {
		expect(
			generateTimelineTicks(domain, zoom)
				.slice(0, expected.length)
				.map((tick) => tick.day.iso),
		).toEqual(expected);
	});
});
