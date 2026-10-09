// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { describe, expect, it } from "vitest";
import { normalizeDateRange } from "../src/core/temporal/DateRange";
import { parseTemporalValue } from "../src/core/temporal/TemporalValue";
import {
	calculateTimeDomain,
	rangeToDayBounds,
	todayPosition,
} from "../src/core/temporal/TimeDomain";

const date = (text: string) => {
	const value = parseTemporalValue(text);
	if (value?.kind !== "date") throw new Error(`Expected date: ${text}`);
	return value;
};

describe("temporal domains", () => {
	it("centers an empty domain on injected today with deterministic padding", () => {
		const today = date("2026-09-19");
		expect(calculateTimeDomain([], { today, paddingDays: 2 })).toEqual({
			startDay: today.dayIndex - 2,
			endDay: today.dayIndex + 3,
			spanDays: 5,
		});
	});

	it("pads populated range bounds without forcing today into the domain", () => {
		const range = normalizeDateRange(date("2020-01-01"), date("2020-01-03"))!;
		const domain = calculateTimeDomain([rangeToDayBounds(range)], {
			today: date("2026-09-19"),
			paddingDays: 1,
		});
		expect(domain.spanDays).toBe(5);
		expect(todayPosition(domain, date("2026-09-19"))).toBe("after");
	});

	it("can include today explicitly for a today marker domain", () => {
		const today = date("2026-09-19");
		const domain = calculateTimeDomain(
			[{ startDay: date("2020-01-01").dayIndex, endDay: date("2020-01-02").dayIndex }],
			{
				today,
				paddingDays: 0,
				includeToday: true,
			},
		);
		expect(todayPosition(domain, today)).toBe("inside");
	});

	it("handles wide and malformed ranges without NaN or Infinity", () => {
		const domain = calculateTimeDomain(
			[
				{ startDay: date("1900-01-01").dayIndex, endDay: date("2200-01-01").dayIndex },
				{ startDay: Number.NaN, endDay: Number.POSITIVE_INFINITY },
			],
			{ today: date("2026-09-19"), paddingDays: 365 },
		);
		expect(Number.isFinite(domain.startDay)).toBe(true);
		expect(Number.isFinite(domain.endDay)).toBe(true);
		expect(domain.spanDays).toBeGreaterThan(100_000);
	});
});
