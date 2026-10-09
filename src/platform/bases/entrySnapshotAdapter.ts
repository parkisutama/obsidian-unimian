// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Bases snapshot adapter (T018, spec §7.5-7.6).
 *
 * Converts live `BasesEntry`/`Value` objects — which Obsidian recreates on every data update —
 * into immutable, path-keyed `EntrySnapshot`s that outlive the update cycle. Only the
 * `BasesPropertyId`s a caller actually requests are read and stored; nothing here retains a
 * `BasesEntry`, a `Value`, or a `TFile` reference.
 */

import {
	type BasesEntry,
	type BasesEntryGroup,
	type BasesPropertyId,
	BooleanValue,
	DateValue,
	FileValue,
	LinkValue,
	ListValue,
	NullValue,
	NumberValue,
	StringValue,
	type Value,
} from "obsidian";
import type { EntrySnapshot } from "../../core/entries/EntrySnapshot";
import { MISSING_VALUE, type NormalizedValue } from "../../core/entries/NormalizedValue";

const WIKILINK = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;
const MARKDOWN_LINK = /^\[([^\]]*)\]\(([^)]+)\)$/;
const EXTERNAL_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

function normalizeLinkText(raw: string): NormalizedValue {
	const text = raw.trim();
	const wiki = WIKILINK.exec(text);
	if (wiki) {
		return {
			kind: "link",
			target: wiki[1]!.trim(),
			display: wiki[2]?.trim() ?? null,
			external: false,
		};
	}
	const markdown = MARKDOWN_LINK.exec(text);
	if (markdown) {
		const target = markdown[2]!.trim();
		return {
			kind: "link",
			target,
			display: markdown[1]?.trim() || null,
			external: EXTERNAL_URL.test(target),
		};
	}
	return { kind: "link", target: text, display: null, external: EXTERNAL_URL.test(text) };
}

/** Converts one live Bases `Value` (or `null`) into a pure `NormalizedValue`. Never throws. */
export function normalizeValue(value: Value | null | undefined): NormalizedValue {
	try {
		if (value == null || value instanceof NullValue) return MISSING_VALUE;
		if (value instanceof DateValue) {
			// DateValue.toString() can serialize a date-only value (no time-of-day entered) as a
			// UTC-anchored instant, which shifts the calendar day by one in any positive-UTC-
			// offset timezone once read back. dateOnly().toString() strips the time portion
			// first, so its calendar day is always trustworthy. Only trust the fuller string's
			// time-of-day when it still names the *same* calendar day as dateOnly() — if the day
			// itself differs, that is the shift artifact, not a real time-of-day, so fall back to
			// the safe date-only string entirely (matches the established, date-only-safe
			// pattern of the former Frappe Gantt view's parseObsidianDate, since removed).
			const dateOnlyText = value.dateOnly().toString();
			const fullText = value.toString();
			const sameCalendarDay = fullText.slice(0, 10) === dateOnlyText.slice(0, 10);
			const hasTime = sameCalendarDay && fullText !== dateOnlyText;
			return { kind: "date", value: hasTime ? fullText : dateOnlyText, hasTime };
		}
		// LinkValue extends StringValue; check it first.
		if (value instanceof LinkValue) return normalizeLinkText(value.toString());
		if (value instanceof FileValue) return { kind: "file", path: value.toString() };
		if (value instanceof ListValue) {
			const items: NormalizedValue[] = [];
			const length = value.length();
			for (let i = 0; i < length; i++) items.push(normalizeValue(value.get(i)));
			return { kind: "list", items };
		}
		if (value instanceof BooleanValue) return { kind: "boolean", value: value.isTruthy() };
		if (value instanceof NumberValue) {
			const parsed = Number(value.toString());
			return Number.isFinite(parsed)
				? { kind: "number", value: parsed }
				: { kind: "unsupported", raw: value };
		}
		if (value instanceof StringValue) return { kind: "text", value: value.toString() };
		// Anything else — including the undocumented ErrorValue Bases returns for a formula
		// error — is malformed from this boundary's point of view: preserved, not thrown away.
		return { kind: "unsupported", raw: value };
	} catch {
		return { kind: "unsupported", raw: value };
	}
}

/** Builds one immutable snapshot for a live entry, reading only the requested properties. */
export function createEntrySnapshot(
	entry: BasesEntry,
	propertyIds: readonly BasesPropertyId[],
): EntrySnapshot {
	const values = new Map<string, NormalizedValue>();
	for (const id of propertyIds) {
		values.set(id, normalizeValue(entry.getValue(id)));
	}
	return {
		path: entry.file.path,
		basename: entry.file.basename,
		extension: entry.file.extension,
		folder: entry.file.parent?.path ?? "",
		ctime: entry.file.stat.ctime,
		mtime: entry.file.stat.mtime,
		values,
	};
}

export interface EntrySnapshotGroup {
	/** The group's key, normalized; `MISSING_VALUE` for Bases' null-key ("ungrouped") group. */
	key: NormalizedValue;
	entries: EntrySnapshot[];
}

/** Builds one snapshot group per `BasesEntryGroup`, preserving Bases' order and null groups. */
export function createEntrySnapshotGroup(
	group: BasesEntryGroup,
	propertyIds: readonly BasesPropertyId[],
): EntrySnapshotGroup {
	return {
		key: group.hasKey() && group.key ? normalizeValue(group.key) : MISSING_VALUE,
		entries: group.entries.map((entry) => createEntrySnapshot(entry, propertyIds)),
	};
}

/** Builds snapshot groups for every `BasesEntryGroup`, in the given order. */
export function createEntrySnapshotGroups(
	groups: readonly BasesEntryGroup[],
	propertyIds: readonly BasesPropertyId[],
): EntrySnapshotGroup[] {
	return groups.map((group) => createEntrySnapshotGroup(group, propertyIds));
}
