// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { type DateOnlyValue, dateOnlyFromDayIndex, dateOnlyFromParts } from "./TemporalValue";
import type { TimeDomain } from "./TimeDomain";

export type TimelineZoom = "day" | "week" | "biweek" | "month" | "quarter" | "year" | "fiveyear";
export type PixelRounding = "none" | "floor" | "nearest" | "ceil";

export interface TimelineZoomSpec {
	id: TimelineZoom;
	pixelsPerDay: number;
	label: string;
}

export const TIMELINE_ZOOM_SPECS: Readonly<Record<TimelineZoom, TimelineZoomSpec>> = {
	day: { id: "day", pixelsPerDay: 64, label: "Day" },
	week: { id: "week", pixelsPerDay: 32, label: "Week" },
	biweek: { id: "biweek", pixelsPerDay: 18, label: "Two weeks" },
	month: { id: "month", pixelsPerDay: 15, label: "Month" },
	quarter: { id: "quarter", pixelsPerDay: 6, label: "Quarter" },
	year: { id: "year", pixelsPerDay: 2, label: "Year" },
	fiveyear: { id: "fiveyear", pixelsPerDay: 0.5, label: "Five years" },
};

export interface TimelineTick {
	day: DateOnlyValue;
	offsetDays: number;
}

export function dateToPixel(dayIndex: number, domain: TimeDomain, zoom: TimelineZoom): number {
	return (dayIndex - domain.startDay) * TIMELINE_ZOOM_SPECS[zoom].pixelsPerDay;
}

export function pixelToDayIndex(
	pixel: number,
	domain: TimeDomain,
	zoom: TimelineZoom,
	rounding: PixelRounding = "none",
): number {
	const raw = domain.startDay + pixel / TIMELINE_ZOOM_SPECS[zoom].pixelsPerDay;
	switch (rounding) {
		case "floor":
			return Math.floor(raw);
		case "nearest":
			return Math.round(raw);
		case "ceil":
			return Math.ceil(raw);
		case "none":
			return raw;
	}
}

function nextTick(day: DateOnlyValue, zoom: TimelineZoom): DateOnlyValue {
	switch (zoom) {
		case "day":
			return dateOnlyFromDayIndex(day.dayIndex + 1);
		case "week":
			return dateOnlyFromDayIndex(day.dayIndex + 7);
		case "biweek":
			return dateOnlyFromDayIndex(day.dayIndex + 14);
		case "month":
			return dateOnlyFromParts(
				day.year + (day.month === 12 ? 1 : 0),
				day.month === 12 ? 1 : day.month + 1,
				1,
			)!;
		case "quarter": {
			const nextMonth = day.month + 3;
			return dateOnlyFromParts(
				day.year + Math.floor((nextMonth - 1) / 12),
				((nextMonth - 1) % 12) + 1,
				1,
			)!;
		}
		case "year":
			return dateOnlyFromParts(day.year + 1, 1, 1)!;
		case "fiveyear":
			return dateOnlyFromParts(day.year + 5, 1, 1)!;
	}
}

function firstTick(domain: TimeDomain, zoom: TimelineZoom): DateOnlyValue {
	const start = dateOnlyFromDayIndex(domain.startDay);
	switch (zoom) {
		case "day":
			return start;
		case "week": {
			const weekday = new Date(start.dayIndex * 86_400_000).getUTCDay();
			const daysUntilMonday = (8 - weekday) % 7;
			return dateOnlyFromDayIndex(start.dayIndex + daysUntilMonday);
		}
		case "biweek": {
			const weekday = new Date(start.dayIndex * 86_400_000).getUTCDay();
			return dateOnlyFromDayIndex(start.dayIndex + ((8 - weekday) % 7));
		}
		case "month":
			return start.day === 1
				? start
				: nextTick(dateOnlyFromParts(start.year, start.month, 1)!, "month");
		case "quarter": {
			const quarterMonth = Math.floor((start.month - 1) / 3) * 3 + 1;
			const current = dateOnlyFromParts(start.year, quarterMonth, 1)!;
			return current.dayIndex >= start.dayIndex ? current : nextTick(current, "quarter");
		}
		case "year":
			return start.month === 1 && start.day === 1
				? start
				: dateOnlyFromParts(start.year + 1, 1, 1)!;
		case "fiveyear": {
			const nextYear = Math.ceil(start.year / 5) * 5;
			return start.year === nextYear && start.month === 1 && start.day === 1
				? start
				: dateOnlyFromParts(nextYear === start.year ? nextYear + 5 : nextYear, 1, 1)!;
		}
	}
}

/** Generates ticks aligned to UTC day, Monday, month, quarter, or year boundaries. */
export function generateTimelineTicks(domain: TimeDomain, zoom: TimelineZoom): TimelineTick[] {
	const ticks: TimelineTick[] = [];
	for (let day = firstTick(domain, zoom); day.dayIndex < domain.endDay; day = nextTick(day, zoom)) {
		ticks.push({ day, offsetDays: day.dayIndex - domain.startDay });
	}
	return ticks;
}
