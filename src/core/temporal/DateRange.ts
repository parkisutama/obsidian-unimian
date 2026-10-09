// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import {
	compareTemporalValues,
	type DateOnlyValue,
	type DateTimeValue,
	dateOnlyFromDayIndex,
	type OngoingValue,
	type TemporalValue,
} from "./TemporalValue";

type ConcreteTemporalValue = Exclude<TemporalValue, OngoingValue>;

export interface NormalizedDateRange {
	start: ConcreteTemporalValue;
	/** Inclusive user-facing endpoint after reversal normalization. */
	endInclusive: ConcreteTemporalValue;
	/** Date-only layout endpoint. Present only when both endpoints are dates. */
	endExclusive: DateOnlyValue | null;
	openEnded: boolean;
	reversed: boolean;
}

export interface NormalizeDateRangeOptions {
	/** Deterministic clock injection for `ongoing`; defaults to the current local calendar date. */
	today?: DateOnlyValue;
}

function localToday(): DateOnlyValue {
	const now = new Date();
	return dateOnlyFromDayIndex(
		Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000),
	);
}

/**
 * Range rules:
 * - start is required and cannot be `ongoing`;
 * - missing end is a one-unit range at start;
 * - `ongoing` resolves to injected/current today and is marked open-ended;
 * - reversed concrete endpoints are swapped;
 * - a date-only inclusive end becomes the following UTC day for layout coordinates.
 */
export function normalizeDateRange(
	start: TemporalValue | null | undefined,
	end?: TemporalValue | null,
	options: NormalizeDateRangeOptions = {},
): NormalizedDateRange | null {
	if (!start || start.kind === "ongoing") return null;
	let concreteEnd: ConcreteTemporalValue = start;
	let openEnded = false;
	if (end?.kind === "ongoing") {
		concreteEnd = options.today ?? localToday();
		openEnded = true;
	} else if (end) {
		concreteEnd = end;
	}

	let normalizedStart = start;
	let normalizedEnd = concreteEnd;
	let reversed = false;
	if (compareTemporalValues(normalizedStart, normalizedEnd) > 0) {
		[normalizedStart, normalizedEnd] = [normalizedEnd, normalizedStart];
		reversed = true;
	}
	const endExclusive =
		normalizedStart.kind === "date" && normalizedEnd.kind === "date"
			? dateOnlyFromDayIndex(normalizedEnd.dayIndex + 1)
			: null;
	return { start: normalizedStart, endInclusive: normalizedEnd, endExclusive, openEnded, reversed };
}

export function rangeDurationMs(range: NormalizedDateRange): number {
	const start =
		range.start.kind === "date"
			? range.start.dayIndex * 86_400_000
			: (range.start as DateTimeValue).epochMs;
	const end =
		range.endInclusive.kind === "date"
			? (range.endExclusive?.dayIndex ?? range.endInclusive.dayIndex) * 86_400_000
			: (range.endInclusive as DateTimeValue).epochMs;
	return Math.max(0, end - start);
}
