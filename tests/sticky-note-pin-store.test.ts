import { describe, expect, it } from "vitest";
import type { StickyNoteData } from "../src/types/settings";
import { isPinned, migratePath, pruneMissing, togglePin } from "../src/views/sticky-note/pinStore";

function data(pinnedByBase: Record<string, string[]> = {}): StickyNoteData {
	return { pinnedByBase };
}

describe("sticky-note pinStore", () => {
	it("isPinned reflects the per-Base set, never a global one", () => {
		const d = data({ "A.base": ["Note.md"] });
		expect(isPinned(d, "A.base", "Note.md")).toBe(true);
		expect(isPinned(d, "B.base", "Note.md")).toBe(false);
	});

	it("togglePin adds then removes, cleaning up an empty Base entry", () => {
		let d = data();
		d = togglePin(d, "A.base", "Note.md");
		expect(isPinned(d, "A.base", "Note.md")).toBe(true);

		d = togglePin(d, "A.base", "Note.md");
		expect(isPinned(d, "A.base", "Note.md")).toBe(false);
		expect(d.pinnedByBase["A.base"]).toBeUndefined();
	});

	it("pinning the same note in two different Bases is independent", () => {
		let d = data();
		d = togglePin(d, "A.base", "Note.md");
		d = togglePin(d, "B.base", "Note.md");
		d = togglePin(d, "A.base", "Note.md"); // unpin from A only

		expect(isPinned(d, "A.base", "Note.md")).toBe(false);
		expect(isPinned(d, "B.base", "Note.md")).toBe(true);
	});

	it("migratePath rewrites a pinned note path (value side)", () => {
		const d = data({ "A.base": ["Old.md", "Other.md"] });
		const migrated = migratePath(d, "Old.md", "New.md");

		expect(isPinned(migrated, "A.base", "New.md")).toBe(true);
		expect(isPinned(migrated, "A.base", "Old.md")).toBe(false);
		expect(isPinned(migrated, "A.base", "Other.md")).toBe(true);
	});

	it("migratePath rewrites a Base file path (key side)", () => {
		const d = data({ "Old.base": ["Note.md"] });
		const migrated = migratePath(d, "Old.base", "New.base");

		expect(isPinned(migrated, "New.base", "Note.md")).toBe(true);
		expect(isPinned(migrated, "Old.base", "Note.md")).toBe(false);
	});

	it("migratePath merges into an existing key rather than overwriting it", () => {
		const d = data({ "Old.base": ["A.md"], "New.base": ["B.md"] });
		const migrated = migratePath(d, "Old.base", "New.base");

		expect(migrated.pinnedByBase["New.base"]).toEqual(expect.arrayContaining(["A.md", "B.md"]));
	});

	it("migratePath is a no-op (same reference) when nothing matches", () => {
		const d = data({ "A.base": ["Note.md"] });
		expect(migratePath(d, "Unrelated.md", "Other.md")).toBe(d);
	});

	it("pruneMissing drops note paths and Base keys that no longer exist", () => {
		const d = data({
			"Kept.base": ["Kept.md", "Deleted.md"],
			"DeletedBase.base": ["Note.md"],
		});
		const exists = (path: string) => path === "Kept.base" || path === "Kept.md";

		const pruned = pruneMissing(d, exists);

		expect(pruned.pinnedByBase).toEqual({ "Kept.base": ["Kept.md"] });
	});

	it("pruneMissing is a no-op (same reference) when everything still exists", () => {
		const d = data({ "A.base": ["Note.md"] });
		expect(pruneMissing(d, () => true)).toBe(d);
	});
});
