// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { NormalizedDateRange } from "./DateRange";
import type { DateOnlyValue } from "./TemporalValue";

export interface TimeDomain {
	/** Inclusive first visible UTC calendar-day index. */
	startDay: number;
	/** Exclusive last visible UTC calendar-day index. */
	endDay: number;
	spanDays: number;
}

export interface DayBounds {
	startDay: number;
	endDay: number;
}

export interface TimeDomainOptions {
	today: DateOnlyValue;
	paddingDays?: number;
	minimumSpanDays?: number;
	includeToday?: boolean;
}

/** Converts a normalized date/datetime range into UTC day bounds for timeline layout. */
export function rangeToDayBounds(range: NormalizedDateRange): DayBounds {
	const startDay =
		range.start.kind === "date"
			? range.start.dayIndex
			: Math.floor(range.start.epochMs / 86_400_000);
	const endDay =
		range.endInclusive.kind === "date"
			? (range.endExclusive?.dayIndex ?? range.endInclusive.dayIndex + 1)
			: Math.max(startDay + 1, Math.ceil(range.endInclusive.epochMs / 86_400_000));
	return { startDay: Math.min(startDay, endDay - 1), endDay: Math.max(startDay + 1, endDay) };
}

function finiteInteger(value: number, fallback: number): number {
	return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

/**
 * Builds a non-empty domain. Empty input is centered on the injected today; populated input
 * is bounded by its ranges unless `includeToday` is requested. Padding and minimum span are
 * deterministic integers so extreme but finite dates never yield NaN/Infinity.
 */
export function calculateTimeDomain(
	ranges: readonly DayBounds[],
	options: TimeDomainOptions,
): TimeDomain {
	const padding = Math.max(0, finiteInteger(options.paddingDays ?? 7, 7));
	const minimumSpan = Math.max(1, finiteInteger(options.minimumSpanDays ?? 1, 1));
	let minimum = options.today.dayIndex;
	let maximum = options.today.dayIndex + 1;

	const valid = ranges.filter(
		(range) =>
			Number.isFinite(range.startDay) &&
			Number.isFinite(range.endDay) &&
			range.endDay > range.startDay,
	);
	if (valid.length > 0) {
		minimum = Math.trunc(valid[0]!.startDay);
		maximum = Math.trunc(valid[0]!.endDay);
		for (const range of valid.slice(1)) {
			minimum = Math.min(minimum, Math.trunc(range.startDay));
			maximum = Math.max(maximum, Math.trunc(range.endDay));
		}
		if (options.includeToday) {
			minimum = Math.min(minimum, options.today.dayIndex);
			maximum = Math.max(maximum, options.today.dayIndex + 1);
		}
	}

	let startDay = minimum - padding;
	let endDay = maximum + padding;
	if (endDay - startDay < minimumSpan) {
		const missing = minimumSpan - (endDay - startDay);
		startDay -= Math.floor(missing / 2);
		endDay += Math.ceil(missing / 2);
	}
	return { startDay, endDay, spanDays: endDay - startDay };
}

export function todayPosition(
	domain: TimeDomain,
	today: DateOnlyValue,
): "before" | "inside" | "after" {
	if (today.dayIndex < domain.startDay) return "before";
	if (today.dayIndex >= domain.endDay) return "after";
	return "inside";
}
