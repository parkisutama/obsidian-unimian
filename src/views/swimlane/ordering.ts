// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesSwimlaneView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

/** Config keys under which the user's dragged column/swimlane order is persisted. */
export const COLUMN_ORDER_KEY = "columnOrder";
export const SWIMLANE_ORDER_KEY = "swimlaneOrder";

/** Parses a persisted JSON string-array order; anything malformed yields an empty order. */
export function parseCustomOrder(value: unknown): string[] {
	if (typeof value !== "string" || !value) return [];
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
	} catch {
		return [];
	}
}

/**
 * Orders group keys. The default is **alphabetical** (deliberately not Bases' own sort);
 * once the user has dragged something, the saved order wins, with keys missing from it
 * appended alphabetically and stale saved keys dropped.
 */
export function orderKeys(keys: Iterable<string>, customOrder: readonly string[]): string[] {
	const defaultKeys = Array.from(keys).sort();
	if (customOrder.length === 0) return defaultKeys;

	const present = new Set(defaultKeys);
	const ordered = customOrder.filter((key) => present.has(key));
	const seen = new Set(ordered);
	for (const key of defaultKeys) {
		if (!seen.has(key)) ordered.push(key);
	}
	return ordered;
}

/**
 * Computes the new key order after moving `draggedKey` next to `targetKey`. Behavior is kept
 * verbatim from the pre-extraction view, including for a target that is not in the list.
 */
export function reorderKeys(
	currentOrder: readonly string[],
	draggedKey: string,
	targetKey: string,
	insertBefore: boolean,
): string[] {
	const next = currentOrder.filter((key) => key !== draggedKey);
	const targetIndex = next.indexOf(targetKey);
	next.splice(insertBefore ? targetIndex : targetIndex + 1, 0, draggedKey);
	return next;
}
