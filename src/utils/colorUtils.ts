// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesCalendarView.ts, src/views/BasesKanbanView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

/**
 * Solarized accent palette — 8 colors, used for deterministic property value coloring.
 * Replaces settings-driven status/priority/calendar color configs.
 */
export const SOLARIZED_ACCENT_COLORS = [
	"#b58900", // yellow
	"#cb4b16", // orange
	"#dc322f", // red
	"#d33682", // magenta
	"#6c71c4", // violet
	"#268bd2", // blue
	"#2aa198", // cyan
	"#859900", // green
] as const;

/**
 * Map any string value to a deterministic Solarized accent color.
 * Same string always returns the same color (hash-based, no settings required).
 */
export function stringToColor(value: string): string {
	if (!value || value === "None") return "#6b7280";
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = value.charCodeAt(i) + ((hash << 5) - hash);
	}
	return SOLARIZED_ACCENT_COLORS[Math.abs(hash) % SOLARIZED_ACCENT_COLORS.length] ?? "#6b7280";
}

/**
 * Return black or white for readable text contrast against a hex background color.
 */
export function getContrastColor(hexColor: string): string {
	const hex = hexColor.replace("#", "");
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.5 ? "#000000" : "#ffffff";
}
