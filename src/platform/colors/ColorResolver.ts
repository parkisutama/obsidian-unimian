// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Shared color resolution (T020, spec §7.8).
 *
 * Consolidates what used to be duplicated across BasesCalendarView and BasesSwimlaneView:
 * explicit color property, Pretty Properties integration, Unimian `valueStyles`
 * compatibility settings, and a deterministic theme-aware fallback — in that priority order.
 * Pure and framework-agnostic: callers inject the Pretty Properties lookup and valueStyles
 * lookup rather than this module touching `window`/plugin settings itself (spec §7.9).
 */

import { getContrastColor, stringToColor } from '../../utils/colorUtils';

export type ColorSource = 'explicit' | 'pretty-properties' | 'value-style' | 'fallback';

export interface ResolvedColor {
	/** Always a value safe to place directly in an inline style or CSS variable. */
	background: string;
	/** `#000000` or `#ffffff`, whichever reads better against `background`. */
	foreground: string;
	source: ColorSource;
}

export interface ColorResolverInputs {
	/** A property whose raw value is itself meant to be a color (e.g. a note's own `color` field). */
	explicitColor?: string | null;
	/** The category value to resolve via Pretty Properties/valueStyles/fallback (e.g. "Todo"). */
	categoryValue?: string | null;
	/** Injected so this module never reaches into `window.PrettyPropertiesApi` itself. */
	resolvePrettyPropertiesColor?: (categoryValue: string) => string | null;
	/** The user-configured `valueStyles[field][categoryValue].color`, if any. */
	valueStyleColor?: string | null;
}

// Deliberately restrictive: only forms this module itself ever produces or a user/plugin could
// plausibly supply as an intentional CSS color, so nothing else can smuggle CSS through an
// inline style (e.g. `url(...)`, `;`-separated extra declarations).
const SAFE_COLOR =
	/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$|^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$|^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

/** True if `value` is one of the color forms this resolver ever accepts as-is. */
export function isSafeColor(value: string): boolean {
	return SAFE_COLOR.test(value.trim());
}

/** A hex string missing its leading `#` (e.g. frontmatter written as `ff0000`) still counts. */
function normalizeExplicitColor(raw: string): string | null {
	const trimmed = raw.trim();
	if (isSafeColor(trimmed)) return trimmed;
	const withHash = `#${trimmed}`;
	return isSafeColor(withHash) ? withHash : null;
}

function finish(background: string, source: ColorSource): ResolvedColor {
	return { background, foreground: getContrastColor(background), source };
}

/**
 * Resolves one color following spec §7.8's priority order. An invalid/unsafe value at any step
 * (garbage frontmatter, an unexpected Pretty Properties result, a malformed valueStyles entry)
 * is skipped rather than used, falling through to the next step — it can never become an
 * unsafe inline style value.
 */
export function resolveColor(inputs: ColorResolverInputs): ResolvedColor {
	if (inputs.explicitColor) {
		const explicit = normalizeExplicitColor(inputs.explicitColor);
		if (explicit) return finish(explicit, 'explicit');
	}

	const category = inputs.categoryValue;
	if (category) {
		const pretty = inputs.resolvePrettyPropertiesColor?.(category) ?? null;
		if (pretty && isSafeColor(pretty)) return finish(pretty, 'pretty-properties');

		if (inputs.valueStyleColor && isSafeColor(inputs.valueStyleColor)) {
			return finish(inputs.valueStyleColor, 'value-style');
		}

		return finish(stringToColor(category), 'fallback');
	}

	return finish(stringToColor(''), 'fallback');
}

/** Semantic CSS variables a renderer can set on an element's `style`, instead of hardcoding properties. */
export function toCssVariables(resolved: ResolvedColor): Record<string, string> {
	return {
		'--unimian-color-bg': resolved.background,
		'--unimian-color-fg': resolved.foreground,
	};
}
