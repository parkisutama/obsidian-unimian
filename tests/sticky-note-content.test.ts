import { describe, expect, it } from "vitest";
import {
	buildCardExcerpt,
	isTextExcerptExtension,
	stripInlineImages,
	truncateExcerpt,
} from "../src/views/sticky-note/content";

describe("sticky-note content: isTextExcerptExtension", () => {
	it("treats markdown/text extensions as excerpt-safe", () => {
		expect(isTextExcerptExtension("md")).toBe(true);
		expect(isTextExcerptExtension("MD")).toBe(true);
		expect(isTextExcerptExtension("markdown")).toBe(true);
		expect(isTextExcerptExtension("txt")).toBe(true);
	});

	it("rejects binary/structured extensions — reading their raw bytes as prose garbles the card (native bug, 2026-09-23: a .png entry rendered as raw PNG chunk data)", () => {
		expect(isTextExcerptExtension("png")).toBe(false);
		expect(isTextExcerptExtension("jpg")).toBe(false);
		expect(isTextExcerptExtension("pdf")).toBe(false);
		expect(isTextExcerptExtension("base")).toBe(false);
		expect(isTextExcerptExtension("canvas")).toBe(false);
	});
});

describe("sticky-note content: stripInlineImages", () => {
	it("removes a wikilink embed of an image, including its trailing newline", () => {
		expect(stripInlineImages("before\n![[Pasted image 123.png]]\nafter")).toBe("before\nafter");
	});

	it("removes standard Markdown image syntax regardless of extension knowledge", () => {
		expect(stripInlineImages("before\n![alt](Pasted%20image%20123.png)\nafter")).toBe(
			"before\nafter",
		);
	});

	it("leaves a non-image wikilink embed (e.g. a note transclusion) untouched", () => {
		expect(stripInlineImages("![[Other Note]]")).toBe("![[Other Note]]");
	});
});

describe("sticky-note content: truncateExcerpt", () => {
	it("leaves short text untouched", () => {
		expect(truncateExcerpt("short", 800)).toBe("short");
	});

	it("breaks at the last newline before the budget, not mid-line", () => {
		const text = `${"a".repeat(50)}\n${"b".repeat(50)}`;
		const truncated = truncateExcerpt(text, 60);
		expect(truncated).toBe("a".repeat(50));
	});
});

describe("sticky-note content: buildCardExcerpt", () => {
	it("strips frontmatter, dedupes a matching leading H1, and strips inline images", () => {
		const raw = `---\ntitle: Foo\n---\n# My Title\n\n![[cover.png]]\n\nBody text.`;
		expect(buildCardExcerpt(raw, "My Title")).toBe("\nBody text.");
	});
});
