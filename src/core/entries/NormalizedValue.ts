// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Normalized entry value contracts (T017, spec §7.6).
 *
 * Pure discriminated value types for what a Bases property can hold. This module imports
 * nothing from `obsidian` — the boundary that converts a live `BasesEntry`/`Value` into one of
 * these (spec §7.5's snapshot adapter) is a separate, `platform`-layer concern (T018). Variant
 * names are prefixed with `Normalized` so a consumer can import both this type and Obsidian's
 * own same-named `Value` subclasses (`DateValue`, `ListValue`, ...) without aliasing.
 *
 * Deliberately excluded here: any formatting/display-string logic. A `NormalizedValue` is raw
 * data; deciding how to render a date, truncate a list, or color a value belongs to the
 * consuming service (color/config/card mapping), not to this type.
 */

/** No value at all: the property is absent, or Bases returned null/undefined for it. */
export interface NormalizedMissing {
	kind: "missing";
}

/** A present string value. Distinct from `missing` — an empty string is still present. */
export interface NormalizedText {
	kind: "text";
	value: string;
}

export interface NormalizedNumber {
	kind: "number";
	value: number;
}

export interface NormalizedBoolean {
	kind: "boolean";
	value: boolean;
}

/**
 * A present date or datetime value, kept as its original ISO-8601-shaped string so no
 * timezone conversion is applied during normalization (spec §7.12 does that deliberately,
 * later, in Temporal Core). `hasTime` distinguishes a date-only value from a datetime.
 */
export interface NormalizedDate {
	kind: "date";
	value: string;
	hasTime: boolean;
}

/** A present list/array value. Items are not required to share one kind. */
export interface NormalizedList {
	kind: "list";
	items: NormalizedValue[];
}

/** An internal wikilink or external URL. `external` distinguishes the two. */
export interface NormalizedLink {
	kind: "link";
	target: string;
	display: string | null;
	external: boolean;
}

/** A file reference (e.g. Bases' `file.*` properties), identified by vault path. */
export interface NormalizedFile {
	kind: "file";
	path: string;
}

/** A present value whose Bases wrapper this normalization boundary does not yet cover. */
export interface NormalizedUnsupported {
	kind: "unsupported";
	raw: unknown;
}

export type NormalizedValue =
	| NormalizedMissing
	| NormalizedText
	| NormalizedNumber
	| NormalizedBoolean
	| NormalizedDate
	| NormalizedList
	| NormalizedLink
	| NormalizedFile
	| NormalizedUnsupported;

export const MISSING_VALUE: NormalizedMissing = { kind: "missing" };

export function isMissing(value: NormalizedValue): value is NormalizedMissing {
	return value.kind === "missing";
}
