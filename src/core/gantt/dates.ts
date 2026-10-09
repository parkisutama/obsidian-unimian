// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { dateOnlyFromDayIndex, parseTemporalValue } from "../temporal/TemporalValue";

export type GanttPropertyDateType = "date" | "datetime";
export type GanttDateBoundary = "start" | "end";

const FLOATING_DATE_TIME =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/;

function twoDigits(value: number): string {
	return String(value).padStart(2, "0");
}

function formatFloating(date: Date): string {
	return (
		`${String(date.getFullYear()).padStart(4, "0")}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}` +
		`T${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
	);
}

/**
 * Normalizes a Date & time property to the local, floating minute precision Gantt stores.
 * Zoned inputs name an instant and are converted to local wall-clock parts. Unzoned inputs are
 * already floating, so validating them through UTC avoids rejecting a wall time in a DST gap.
 */
function normalizeFloatingDateTime(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const match = FLOATING_DATE_TIME.exec(value.trim());
	if (!match) return null;
	const [
		,
		yearText,
		monthText,
		dayText,
		hourText,
		minuteText,
		secondText = "0",
		fractionText = "0",
		zone,
	] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const hour = Number(hourText);
	const minute = Number(minuteText);
	const second = Number(secondText);
	const millisecond = Number(fractionText.padEnd(3, "0"));
	if (hour > 23 || minute > 59 || second > 59) return null;

	if (zone) {
		const instant = new Date(value);
		return Number.isFinite(instant.getTime()) ? formatFloating(instant) : null;
	}

	const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
	if (
		probe.getUTCFullYear() !== year ||
		probe.getUTCMonth() !== month - 1 ||
		probe.getUTCDate() !== day ||
		probe.getUTCHours() !== hour ||
		probe.getUTCMinutes() !== minute ||
		probe.getUTCSeconds() !== second
	)
		return null;
	return `${String(year).padStart(4, "0")}-${twoDigits(month)}-${twoDigits(day)}T${twoDigits(hour)}:${twoDigits(minute)}`;
}

/** Converts a stored property value to the date string consumed by the chart library. */
export function readGanttDate(
	value: unknown,
	propertyType: GanttPropertyDateType,
	boundary: GanttDateBoundary,
): string | null {
	if (propertyType === "datetime") return normalizeFloatingDateTime(value);
	const parsed = parseTemporalValue(value);
	if (parsed?.kind !== "date") return null;
	return boundary === "end" ? dateOnlyFromDayIndex(parsed.dayIndex + 1).iso : parsed.iso;
}

const CHART_DATE =
	/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Converts a chart date back to the local, offset-free property storage contract.
 *
 * Chart dates are floating wall-clock values that the library keeps in UTC: it reads
 * `2026-10-02T09:00` as 09:00 UTC and reports every edit as an ISO string ending in `Z`. That
 * `Z` is the library's representation, not an instant, so it is ignored here. Converting it to
 * local time would move a 09:00 task to 16:00 in UTC+7, and a Date property could not parse it.
 * Property values that really are instants belong to `readGanttDate`, which does convert them.
 */
export function writeGanttDate(
	value: unknown,
	propertyType: GanttPropertyDateType,
	boundary: GanttDateBoundary,
): string | null {
	if (typeof value !== "string") return null;
	const match = CHART_DATE.exec(value.trim());
	if (!match) return null;
	const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const hour = Number(hourText ?? "0");
	const minute = Number(minuteText ?? "0");
	const second = Number(secondText ?? "0");
	const millisecond = Number((fractionText ?? "0").padEnd(3, "0"));
	if (hour > 23 || minute > 59 || second > 59) return null;
	const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
	if (
		probe.getUTCFullYear() !== year ||
		probe.getUTCMonth() !== month - 1 ||
		probe.getUTCDate() !== day
	)
		return null;

	if (propertyType === "datetime") {
		return `${String(year).padStart(4, "0")}-${twoDigits(month)}-${twoDigits(day)}T${twoDigits(hour)}:${twoDigits(minute)}`;
	}
	const dayIndex = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
	// The library's end boundary is always exclusive. At coarse zoom levels it may report that
	// boundary with a sub-day time (for example 06:00), but a Date property still stores the
	// inclusive final calendar day.
	return dateOnlyFromDayIndex(boundary === "end" ? dayIndex - 1 : dayIndex).iso;
}
