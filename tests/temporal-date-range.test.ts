// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { describe, expect, it } from "vitest";
import { normalizeDateRange, rangeDurationMs } from "../src/core/temporal/DateRange";
import { parseTemporalValue } from "../src/core/temporal/TemporalValue";

const value = (text: string) => parseTemporalValue(text)!;

describe("date range normalization", () => {
	it("turns an inclusive date range into an end-exclusive UTC day boundary", () => {
		const range = normalizeDateRange(value("2026-01-01"), value("2026-01-03"))!;
		expect(range.endExclusive?.iso).toBe("2026-01-04");
		expect(rangeDurationMs(range)).toBe(3 * 86_400_000);
	});

	it("treats a missing end as one unit at the start", () => {
		const dateRange = normalizeDateRange(value("2026-01-01"))!;
		expect(dateRange.endExclusive?.iso).toBe("2026-01-02");
		expect(rangeDurationMs(dateRange)).toBe(86_400_000);
		const instantRange = normalizeDateRange(value("2026-01-01T09:30Z"))!;
		expect(rangeDurationMs(instantRange)).toBe(0);
	});

	it("normalizes reversed endpoints and records that fact", () => {
		const range = normalizeDateRange(value("2026-01-05"), value("2026-01-02"))!;
		expect(range).toMatchObject({
			reversed: true,
			start: { iso: "2026-01-02" },
			endInclusive: { iso: "2026-01-05" },
		});
	});

	it("resolves ongoing against an injected today without hiding that it is open-ended", () => {
		const today = value("2026-01-10");
		if (today.kind !== "date") throw new Error("expected date");
		const range = normalizeDateRange(value("2026-01-01"), value("ongoing"), { today })!;
		expect(range).toMatchObject({ openEnded: true, endInclusive: { iso: "2026-01-10" } });
	});

	it("rejects a missing or ongoing start", () => {
		expect(normalizeDateRange(null, value("2026-01-02"))).toBeNull();
		expect(normalizeDateRange(value("ongoing"), value("2026-01-02"))).toBeNull();
	});
});
