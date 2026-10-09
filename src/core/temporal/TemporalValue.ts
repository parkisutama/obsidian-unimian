// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/** Pure temporal values. No Obsidian or rendering-engine imports. */

export interface DateOnlyValue {
	kind: "date";
	iso: string;
	year: number;
	month: number;
	day: number;
	/** UTC-based calendar-day identity; never derived through local midnight. */
	dayIndex: number;
}

export interface DateTimeValue {
	kind: "datetime";
	iso: string;
	epochMs: number;
	timezone: "utc" | "offset" | "local";
}

export interface OngoingValue {
	kind: "ongoing";
}

export type TemporalValue = DateOnlyValue | DateTimeValue | OngoingValue;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/;

export function dateOnlyFromParts(year: number, month: number, day: number): DateOnlyValue | null {
	const utc = new Date(Date.UTC(year, month - 1, day));
	if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day)
		return null;
	const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	return { kind: "date", iso, year, month, day, dayIndex: Math.floor(utc.getTime() / 86_400_000) };
}

export function dateOnlyFromDayIndex(dayIndex: number): DateOnlyValue {
	const date = new Date(dayIndex * 86_400_000);
	return dateOnlyFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())!;
}

/**
 * Strictly parses canonical ISO date/date-time strings plus the explicit `ongoing` token.
 * Space-separated or locale-shaped dates are rejected rather than guessed.
 */
export function parseTemporalValue(input: unknown): TemporalValue | null {
	if (typeof input !== "string") return null;
	const text = input.trim();
	if (text.toLowerCase() === "ongoing") return { kind: "ongoing" };

	const dateMatch = DATE_ONLY.exec(text);
	if (dateMatch)
		return dateOnlyFromParts(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]));

	const timeMatch = DATE_TIME.exec(text);
	if (!timeMatch) return null;
	const [, y, mo, d, h, mi, s = "0", fraction = "0", zone] = timeMatch;
	const year = Number(y);
	const month = Number(mo);
	const day = Number(d);
	const hour = Number(h);
	const minute = Number(mi);
	const second = Number(s);
	const millisecond = Number(fraction.padEnd(3, "0"));
	if (!dateOnlyFromParts(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;

	if (!zone) {
		const local = new Date(year, month - 1, day, hour, minute, second, millisecond);
		if (
			local.getFullYear() !== year ||
			local.getMonth() !== month - 1 ||
			local.getDate() !== day ||
			local.getHours() !== hour ||
			local.getMinutes() !== minute ||
			local.getSeconds() !== second
		)
			return null;
		return { kind: "datetime", iso: text, epochMs: local.getTime(), timezone: "local" };
	}

	if (zone !== "Z") {
		const [offsetHour, offsetMinute] = zone.slice(1).split(":").map(Number);
		if ((offsetHour ?? 99) > 23 || (offsetMinute ?? 99) > 59) return null;
	}
	const epochMs = Date.parse(text);
	if (!Number.isFinite(epochMs)) return null;
	return { kind: "datetime", iso: text, epochMs, timezone: zone === "Z" ? "utc" : "offset" };
}

export function compareTemporalValues(
	left: Exclude<TemporalValue, OngoingValue>,
	right: Exclude<TemporalValue, OngoingValue>,
): number {
	const leftValue = left.kind === "date" ? left.dayIndex * 86_400_000 : left.epochMs;
	const rightValue = right.kind === "date" ? right.dayIndex * 86_400_000 : right.epochMs;
	return leftValue - rightValue;
}
