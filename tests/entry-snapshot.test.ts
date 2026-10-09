import type { BasesEntry, BasesEntryGroup } from "obsidian";
import { describe, expect, it } from "vitest";
import { MISSING_VALUE } from "../src/core/entries/NormalizedValue";
import {
	createEntrySnapshot,
	createEntrySnapshotGroups,
	normalizeValue,
} from "../src/platform/bases/entrySnapshotAdapter";
import {
	BooleanValue,
	DateValue,
	FileValue,
	LinkValue,
	ListValue,
	NullValue,
	NumberValue,
	StringValue,
	TFile,
} from "./fixtures/obsidian";

function makeEntry(path: string, values: Record<string, unknown>): BasesEntry {
	const file = new TFile(path);
	// The real TFile only has basename/path; stat/parent/extension are read by the adapter too.
	(file as unknown as { extension: string }).extension = path.split(".").pop() ?? "";
	(file as unknown as { stat: { ctime: number; mtime: number } }).stat = { ctime: 1, mtime: 2 };
	(file as unknown as { parent: { path: string } | null }).parent = path.includes("/")
		? { path: path.slice(0, path.lastIndexOf("/")) }
		: null;
	return {
		file,
		getValue: (id: string) => (values[id] ?? null) as never,
	} as unknown as BasesEntry;
}

describe("normalizeValue", () => {
	it("normalizes null and NullValue to the shared missing value", () => {
		expect(normalizeValue(null)).toEqual(MISSING_VALUE);
		expect(normalizeValue(new NullValue() as never)).toEqual(MISSING_VALUE);
	});

	it("normalizes a note/text value", () => {
		expect(normalizeValue(new StringValue("hello") as never)).toEqual({
			kind: "text",
			value: "hello",
		});
	});

	it("normalizes a checkbox (boolean) value via isTruthy", () => {
		expect(normalizeValue(new BooleanValue(true) as never)).toEqual({
			kind: "boolean",
			value: true,
		});
		expect(normalizeValue(new BooleanValue(false) as never)).toEqual({
			kind: "boolean",
			value: false,
		});
	});

	it("normalizes a date-only value without a time component", () => {
		expect(normalizeValue(new DateValue("2026-01-01") as never)).toEqual({
			kind: "date",
			value: "2026-01-01",
			hasTime: false,
		});
	});

	it("normalizes a datetime value with a time component", () => {
		expect(normalizeValue(new DateValue("2026-01-01T10:00:00") as never)).toEqual({
			kind: "date",
			value: "2026-01-01T10:00:00",
			hasTime: true,
		});
	});

	it("prefers the date-only calendar day when toString() reports a UTC-shifted day (positive-offset timezone artifact)", () => {
		// Reproduces a real bug: Obsidian's real DateValue.toString() can serialize a date-only
		// property (no time entered by the user) as a UTC instant, which lands on the *previous*
		// calendar day once read back in a positive-UTC-offset timezone (e.g. end: 2026-09-21
		// stringifying as "2026-09-20T17:00:00.000Z"). dateOnly() is unaffected because it never
		// carries a time to shift. The adapter must trust dateOnly()'s day whenever the two
		// disagree, not just when the strings are byte-identical.
		class ShiftedDateValue extends DateValue {
			toString(): string {
				return "2026-09-20T17:00:00.000Z";
			}
		}
		const shifted = new ShiftedDateValue("2026-09-21") as never;
		expect(normalizeValue(shifted)).toEqual({ kind: "date", value: "2026-09-21", hasTime: false });
	});

	it("normalizes a formula-produced number", () => {
		expect(normalizeValue(new NumberValue(42) as never)).toEqual({ kind: "number", value: 42 });
	});

	it("normalizes a wikilink into target/display/external", () => {
		expect(normalizeValue(new LinkValue("[[Target|Display]]") as never)).toEqual({
			kind: "link",
			target: "Target",
			display: "Display",
			external: false,
		});
		expect(normalizeValue(new LinkValue("https://example.com") as never)).toEqual({
			kind: "link",
			target: "https://example.com",
			display: null,
			external: true,
		});
	});

	it("normalizes a file value to its path", () => {
		expect(normalizeValue(new FileValue("Folder/Note.md") as never)).toEqual({
			kind: "file",
			path: "Folder/Note.md",
		});
	});

	it("normalizes a list value, recursing into each item", () => {
		const list = new ListValue([new StringValue("a"), new NumberValue(1)] as never) as never;
		expect(normalizeValue(list)).toEqual({
			kind: "list",
			items: [
				{ kind: "text", value: "a" },
				{ kind: "number", value: 1 },
			],
		});
	});

	it("normalizes a malformed/unrecognized wrapper to unsupported instead of throwing", () => {
		class MysteryValue {
			toString() {
				throw new Error("boom");
			}
		}
		expect(() => normalizeValue(new MysteryValue() as never)).not.toThrow();
		expect(normalizeValue(new MysteryValue() as never).kind).toBe("unsupported");
	});
});

describe("createEntrySnapshot", () => {
	it("reads only the requested properties, keyed by property id", () => {
		const entry = makeEntry("Tasks/A.md", { "note.status": new StringValue("Todo") });
		const snapshot = createEntrySnapshot(entry, ["note.status" as never, "note.priority" as never]);
		expect(snapshot.values.get("note.status")).toEqual({ kind: "text", value: "Todo" });
		expect(snapshot.values.get("note.priority")).toEqual(MISSING_VALUE);
		expect(snapshot.values.has("note.other")).toBe(false);
	});

	it("captures file identity/metadata without retaining the BasesEntry", () => {
		const entry = makeEntry("Tasks/A.md", {});
		const snapshot = createEntrySnapshot(entry, []);
		expect(snapshot).toEqual({
			path: "Tasks/A.md",
			basename: "A",
			extension: "md",
			folder: "Tasks",
			ctime: 1,
			mtime: 2,
			values: new Map(),
		});
	});
});

describe("createEntrySnapshotGroups", () => {
	it("preserves Bases order and normalizes a null-key group to the missing value", () => {
		const groupA = {
			key: new StringValue("Todo") as never,
			entries: [makeEntry("A.md", {})],
			hasKey: () => true,
		} as unknown as BasesEntryGroup;
		const ungrouped = {
			key: undefined,
			entries: [makeEntry("B.md", {})],
			hasKey: () => false,
		} as unknown as BasesEntryGroup;

		const groups = createEntrySnapshotGroups([groupA, ungrouped], []);
		expect(groups.map((g) => g.key)).toEqual([{ kind: "text", value: "Todo" }, MISSING_VALUE]);
		expect(groups.map((g) => g.entries[0]?.path)).toEqual(["A.md", "B.md"]);
	});

	it("replacing every BasesEntry after building snapshots does not invalidate them", () => {
		let entries = [makeEntry("A.md", { "note.status": new StringValue("Todo") })];
		const group = { key: undefined, entries, hasKey: () => false } as unknown as BasesEntryGroup;
		const [snapshot] = createEntrySnapshotGroups([group], ["note.status" as never]);

		// Obsidian recreates BasesQueryResult/BasesEntry objects after every update; simulate
		// that by discarding the old entries entirely.
		entries = [];
		expect(entries).toHaveLength(0);

		expect(snapshot!.entries[0]).toEqual({
			path: "A.md",
			basename: "A",
			extension: "md",
			folder: "",
			ctime: 1,
			mtime: 2,
			values: new Map([["note.status", { kind: "text", value: "Todo" }]]),
		});
	});
});
