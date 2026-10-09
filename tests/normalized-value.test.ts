// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { describe, expect, it } from "vitest";
import { type EntrySnapshot, getValue } from "../src/core/entries/EntrySnapshot";
import {
	isMissing,
	MISSING_VALUE,
	type NormalizedValue,
} from "../src/core/entries/NormalizedValue";

describe("NormalizedValue", () => {
	it("distinguishes missing from a present-but-empty text value", () => {
		const missing: NormalizedValue = MISSING_VALUE;
		const empty: NormalizedValue = { kind: "text", value: "" };
		expect(isMissing(missing)).toBe(true);
		expect(isMissing(empty)).toBe(false);
	});

	it("carries every documented kind without any formatting method attached", () => {
		const values: NormalizedValue[] = [
			MISSING_VALUE,
			{ kind: "text", value: "hello" },
			{ kind: "number", value: 42 },
			{ kind: "boolean", value: true },
			{ kind: "date", value: "2026-01-01", hasTime: false },
			{ kind: "date", value: "2026-01-01T10:00:00", hasTime: true },
			{ kind: "list", items: [{ kind: "text", value: "a" }] },
			{ kind: "link", target: "Note.md", display: "Note", external: false },
			{ kind: "file", path: "Folder/Note.md" },
			{ kind: "unsupported", raw: Symbol("wrapper") },
		];
		for (const value of values) {
			expect(typeof value.kind).toBe("string");
			expect((value as { toString?: unknown }).toString).toBe(Object.prototype.toString);
		}
	});
});

describe("EntrySnapshot", () => {
	const snapshot: EntrySnapshot = {
		path: "Tasks/A.md",
		basename: "A",
		extension: "md",
		folder: "Tasks",
		ctime: 0,
		mtime: 0,
		values: new Map([["note.status", { kind: "text", value: "Todo" }]]),
	};

	it("reads a requested property's normalized value", () => {
		expect(getValue(snapshot, "note.status")).toEqual({ kind: "text", value: "Todo" });
	});

	it("returns undefined, not a missing value, for a property that was never requested", () => {
		expect(getValue(snapshot, "note.never_requested")).toBeUndefined();
	});
});
