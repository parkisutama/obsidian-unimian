// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesKanbanView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import type { EntrySnapshot } from "../../core/entries/EntrySnapshot";
import type { NormalizedValue } from "../../core/entries/NormalizedValue";

/**
 * Convert any value to a string for grouping/display
 * Uses type assertions to satisfy ESLint no-base-to-string rule
 */
export function valueToString(value: unknown): string {
	if (value === null || value === undefined) return "None";
	if (Array.isArray(value)) {
		const filtered = value.filter((v) => v !== null && v !== undefined && v !== "" && v !== "null");
		if (filtered.length === 0) return "None";
		return filtered.join(", ");
	}
	// Handle primitives directly
	if (typeof value === "string") return value || "None";
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	// Handle objects - try toString() for objects that implement it meaningfully
	if (typeof value === "object") {
		const objStr = (value as { toString(): string }).toString();
		// Check for meaningful toString result
		if (objStr && objStr !== "[object Object]") return objStr || "None";
		// Fall back to JSON for plain objects
		try {
			const json = JSON.stringify(value);
			return json || "None";
		} catch {
			return "None";
		}
	}
	// For remaining types (symbol, bigint, function), use String with type assertion
	return String(value as string | number | boolean | bigint) || "None";
}

/**
 * Get frontmatter directly from Obsidian's metadata cache (bypasses Bases getValue)
 * This is needed because Bases getValue may not return custom frontmatter properties
 */
export function getEntryValue(entry: EntrySnapshot, propId: string): unknown {
	if (propId === "file.folder") {
		if (!entry.folder) return "Root";
		return entry.folder.split("/").pop() || "Root";
	}
	if (propId === "file.basename") return entry.basename;
	if (propId === "file.path") return entry.path;
	return normalizedValueToPlain(entry.values.get(propId));
}

export function normalizedValueToPlain(value: NormalizedValue | undefined): unknown {
	if (!value || value.kind === "missing") return undefined;
	switch (value.kind) {
		case "text":
		case "date":
			return value.value;
		case "number":
		case "boolean":
			return value.value;
		case "link":
			return value.display || value.target;
		case "file":
			return value.path;
		case "list":
			return value.items
				.map((item) => normalizedValueToPlain(item))
				.filter((item) => item !== undefined);
		case "unsupported":
			return value.raw == null ? undefined : String(value.raw);
	}
}

/** Returns true when a string value looks like an ISO 8601 date or datetime. */
export function looksLikeDateString(value: string): boolean {
	// Matches: 2026-02-22, 2026-02-22T17:35:12, 2026-02-22T17:35:12+07:00, ...Z
	return /^\d{4}-\d{2}-\d{2}(T[\d:.]+([+-]\d{2}:?\d{2}|Z)?)?$/.test(value.trim());
}

export function formatDate(value: unknown, format = "date-short"): string | null {
	if (!value) return null;
	if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date))
		return null;

	try {
		// For ISO strings with timezone offset, normalize to local time via Date constructor.
		// JS handles '2026-02-22T17:35:12+07:00' correctly.
		const date = value instanceof Date ? value : new Date(value);
		if (isNaN(date.getTime())) return null;

		switch (format) {
			case "date-short":
				return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
			case "date-medium":
				return date.toLocaleDateString(undefined, {
					month: "short",
					day: "numeric",
					year: "numeric",
				});
			case "date-long":
				return date.toLocaleDateString(undefined, {
					month: "long",
					day: "numeric",
					year: "numeric",
				});
			case "date-numeric":
				return date.toLocaleDateString(undefined, {
					month: "numeric",
					day: "numeric",
					year: "numeric",
				});
			case "datetime-short":
				return (
					date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
					" " +
					date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
				);
			case "datetime-medium":
				return (
					date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
					" " +
					date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
				);
			case "relative": {
				const diffMs = date.getTime() - Date.now();
				const diffDays = Math.round(diffMs / 86400000);
				if (diffDays === 0) return "Today";
				if (diffDays === 1) return "Tomorrow";
				if (diffDays === -1) return "Yesterday";
				if (diffDays > 0) return `in ${diffDays}d`;
				return `${Math.abs(diffDays)}d ago`;
			}
			default:
				return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
		}
	} catch {
		return null;
	}
}
