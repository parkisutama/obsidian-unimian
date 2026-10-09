// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * View option classification (T019, spec §7.7).
 *
 * Distinguishes a view option that only affects a CSS variable/class (e.g. card width, gap,
 * bar height) from one that affects data normalization/mapping (e.g. which property is the
 * title). A render scheduler (T022) uses this to take a CSS-only fast path instead of
 * rebuilding a view's data model when only a CSS-only option changed. Classification here is a
 * pure lookup — it never constructs an `EntrySnapshot` or any other data model.
 */

export type OptionKind = "data" | "css";

export interface ViewOptionSchema {
	readonly cssOnlyKeys: ReadonlySet<string>;
}

/** Declares which of a view's option keys are CSS-only. Every other key defaults to `'data'`. */
export function createViewOptionSchema(cssOnlyKeys: readonly string[]): ViewOptionSchema {
	return { cssOnlyKeys: new Set(cssOnlyKeys) };
}

export function classifyOption(schema: ViewOptionSchema, key: string): OptionKind {
	return schema.cssOnlyKeys.has(key) ? "css" : "data";
}

/** True if every key in `keys` is CSS-only under `schema` — e.g. "did only CSS-only options change?" */
export function areAllCssOnly(schema: ViewOptionSchema, keys: readonly string[]): boolean {
	return keys.length > 0 && keys.every((key) => classifyOption(schema, key) === "css");
}
