// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesCalendarView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import type { EventInput } from "fullcalendar";
import type { BasesEntry, BasesPropertyId } from "obsidian";
import { type ResolvedColor, resolveColor } from "../../platform/colors/ColorResolver";
import { isOngoing } from "../../utils/dateUtils";

/** Everything `entryToEvent` needs from the view: field names plus the color lookups. */
export interface EventMappingContext {
	dateStartField: string;
	dateEndField: string;
	titleField: string | null;
	allDayField: string | null;
	colorByProp: string;
	valueStyleColor(colorByProp: string, value: string): string | null;
	resolvePrettyPropertiesColor(propName: string, value: string): string | null;
}

export function hasTime(dateStr: string): boolean {
	// Check if date string contains a non-midnight time
	if (!dateStr.includes("T")) return false;

	// Extract time portion and check if it's not midnight
	const timePart = dateStr.split("T")[1];
	if (!timePart) return false;

	// Check for midnight patterns: 00:00:00, 00:00:00.000, 00:00:00.000Z, etc.
	const timeWithoutTz = timePart.replace(/[Z+-].*$/, ""); // Remove timezone
	return !timeWithoutTz.startsWith("00:00:00");
}

export function toISOString(value: unknown): string {
	// Handle "ongoing" keyword - resolve to current time
	if (isOngoing(value)) {
		return new Date().toISOString();
	}
	// Handle Date objects
	if (value instanceof Date) {
		return value.toISOString();
	}
	// Handle strings that might be dates
	if (typeof value === "string") {
		return value;
	}
	// Handle numbers (timestamps)
	if (typeof value === "number") {
		return new Date(value).toISOString();
	}
	// Fallback
	return String(value);
}

export function isAllDayValue(value: unknown): boolean {
	// Handle explicit boolean true
	if (value === true) return true;
	// Handle string "true"
	if (typeof value === "string" && value.toLowerCase() === "true") return true;
	// Everything else (false, "false", null, undefined) is not all-day
	return false;
}

/**
 * Format a Date object as an ISO string with local timezone offset
 * e.g., "2026-01-06T10:30:00-05:00" instead of "2026-01-06T15:30:00.000Z"
 */
export function toLocalISOString(date: Date): string {
	const tzOffset = date.getTimezoneOffset();
	const offsetHours = Math.abs(Math.floor(tzOffset / 60));
	const offsetMinutes = Math.abs(tzOffset % 60);
	const offsetSign = tzOffset <= 0 ? "+" : "-";
	const offsetStr = `${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;

	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");

	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetStr}`;
}

/** Resolves an event's color through the shared ColorResolver (spec §7.8). */
export function resolveEntryColor(entry: BasesEntry, ctx: EventMappingContext): ResolvedColor {
	const colorByProp = ctx.colorByProp;
	if (colorByProp === "none" || !colorByProp) return resolveColor({});

	const propName = colorByProp.split(".")[1] || colorByProp;

	if (propName === "color") {
		const colorValue = entry.getValue(colorByProp as BasesPropertyId);
		return resolveColor({ explicitColor: colorValue ? String(colorValue) : null });
	}

	if (propName === "folder") {
		const folderPath = entry.file.parent?.path || "/";
		const folderName = folderPath === "/" ? "Root" : entry.file.parent?.name || "Root";
		return resolveColor({
			categoryValue: folderName,
			valueStyleColor: ctx.valueStyleColor(colorByProp, folderName),
		});
	}

	const value = entry.getValue(colorByProp as BasesPropertyId);
	const valueStr =
		value == null
			? null
			: Array.isArray(value)
				? value[0] != null
					? String(value[0])
					: null
				: String(value);

	return resolveColor({
		categoryValue: valueStr,
		resolvePrettyPropertiesColor: (v) => ctx.resolvePrettyPropertiesColor(propName, v),
		valueStyleColor: valueStr ? ctx.valueStyleColor(colorByProp, valueStr) : null,
	});
}

export function entryToEvent(entry: BasesEntry, ctx: EventMappingContext): EventInput | null {
	const dateStart = entry.getValue(ctx.dateStartField as BasesPropertyId);
	const dateEnd = entry.getValue(ctx.dateEndField as BasesPropertyId);
	const allDayValue = ctx.allDayField ? entry.getValue(ctx.allDayField as BasesPropertyId) : null;

	// Must have a start date
	if (!dateStart) return null;

	// Get title using configured field, with fallbacks
	let title: string;
	if (!ctx.titleField || ctx.titleField === "file.basename") {
		title = entry.file.basename;
	} else {
		const titleValue = entry.getValue(ctx.titleField as BasesPropertyId);
		title = titleValue ? String(titleValue) : entry.file.basename || "Untitled";
	}

	const resolvedColor = resolveEntryColor(entry, ctx);

	// Convert dates to ISO strings (handles both Date objects and strings)
	const startStr = toISOString(dateStart);
	const endStr = dateEnd ? toISOString(dateEnd) : undefined;

	// Determine if all-day event:
	// - Explicitly set to true in frontmatter
	// - OR start date has no time component
	const isAllDay = isAllDayValue(allDayValue) || !hasTime(startStr);

	return {
		id: entry.file.path,
		title: String(title),
		start: startStr,
		end: endStr,
		allDay: isAllDay,
		color: resolvedColor.background,
		contrastColor: resolvedColor.foreground,
		// Path only — never a live BasesEntry, which Obsidian recreates on the next update
		// (spec §7.5). Anything needing entry data resolves it fresh, by path, at interaction time.
		extendedProps: {
			path: entry.file.path,
		},
	};
}
