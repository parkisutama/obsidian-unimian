import { describe, expect, it } from "vitest";
import { dateOnlyFromDayIndex, parseTemporalValue } from "../src/core/temporal/TemporalValue";

describe("strict temporal values", () => {
	it("keeps a date-only value as a UTC-safe calendar day", () => {
		const value = parseTemporalValue("2026-01-01");
		expect(value).toMatchObject({ kind: "date", iso: "2026-01-01" });
		if (value?.kind !== "date") throw new Error("expected date");
		expect(dateOnlyFromDayIndex(value.dayIndex).iso).toBe("2026-01-01");
	});

	it("distinguishes local, UTC, and offset datetimes", () => {
		expect(parseTemporalValue("2026-01-01T09:30")?.kind).toBe("datetime");
		expect(parseTemporalValue("2026-01-01T09:30")).toMatchObject({ timezone: "local" });
		expect(parseTemporalValue("2026-01-01T09:30Z")).toMatchObject({ timezone: "utc" });
		expect(parseTemporalValue("2026-01-01T09:30+07:00")).toMatchObject({ timezone: "offset" });
	});

	it("recognizes ongoing explicitly", () => {
		expect(parseTemporalValue("ONGOING")).toEqual({ kind: "ongoing" });
	});

	it.each(["2026-02-30", "01/02/2026", "2026-01-01 09:30", "tomorrow", "", "2026-01-01T25:00"])(
		"rejects invalid or guessed input %s",
		(input) => {
			expect(parseTemporalValue(input)).toBeNull();
		},
	);
});
