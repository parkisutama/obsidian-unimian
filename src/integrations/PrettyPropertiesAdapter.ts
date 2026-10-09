// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Pretty Properties integration adapter (T020, spec §7.8-7.9).
 *
 * Isolates the optional Pretty Properties plugin's undocumented global API so generic
 * renderers/services never touch `window` directly (spec §7.9). Consolidates what used to be
 * two near-duplicate private methods on BasesCalendarView and BasesSwimlaneView.
 */

interface PrettyPropertiesHsl {
	h: number;
	s: number;
	l: number;
}

interface PrettyPropertiesApi {
	getPropertyBackgroundColorSetting(
		propName: string,
		propValue: string,
	): string | PrettyPropertiesHsl | undefined;
}

interface WindowWithPrettyProperties extends Window {
	PrettyPropertiesApi?: PrettyPropertiesApi;
}

const NAMED_COLORS = [
	"red",
	"orange",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"pink",
] as const;

function getApi(win: Window): PrettyPropertiesApi | null {
	return (win as WindowWithPrettyProperties).PrettyPropertiesApi ?? null;
}

/**
 * Resolves a Pretty Properties color setting to a CSS color string, or `null` if Pretty
 * Properties is not installed, no color is assigned to `propValue`, or the setting can't be
 * resolved to a concrete color. Pretty Properties stores colors by value, not by property
 * name; `propName` only selects which settings dictionary it looks in.
 *
 * @param alpha 1 (default) for a solid color; less than 1 for a semi-transparent background.
 */
export function resolvePrettyPropertiesColor(
	win: Window,
	doc: Document,
	propName: string,
	propValue: string,
	alpha = 1,
): string | null {
	const api = getApi(win);
	if (!api) return null;

	try {
		// A named color string ("red", "blue", …), an HSL object, "none" (transparent), or
		// "default" (no color assigned).
		const setting = api.getPropertyBackgroundColorSetting(propName, propValue);
		if (!setting || setting === "default" || setting === "none") return null;

		if (typeof setting === "string" && (NAMED_COLORS as readonly string[]).includes(setting)) {
			// Resolve the Obsidian theme CSS variable (e.g. --color-red-rgb) to a concrete color.
			const rgbStr = getComputedStyle(doc.body).getPropertyValue(`--color-${setting}-rgb`).trim();
			if (!rgbStr) return null;
			const parts = rgbStr.split(/[\s,]+/).map((n) => Number.parseInt(n.trim(), 10));
			if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
			const [r, g, b] = parts;
			return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
		}

		if (typeof setting === "object" && setting != null && typeof setting.h === "number") {
			const { h, s, l } = setting;
			return alpha >= 1 ? `hsl(${h}, ${s}%, ${l}%)` : `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
		}

		return null;
	} catch {
		// Pretty Properties API error — treat as unresolved, never throw into the caller.
		return null;
	}
}
