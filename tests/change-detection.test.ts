// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { describe, expect, it } from "vitest";
import {
	computeRenderSignature,
	diffRenderSignatures,
} from "../src/platform/bases/changeDetection";

const baseInput = {
	entries: [
		{ path: "A.md", mtime: 1 },
		{ path: "B.md", mtime: 2 },
	],
	order: ["note.title"],
	groupKeys: ["Todo", "Done"],
	config: { titleField: "note.title" },
};

describe("computeRenderSignature", () => {
	it("is a pure function of primitives, not of any retained object identity", () => {
		const a = computeRenderSignature(baseInput);
		const b = computeRenderSignature({ ...baseInput, entries: [...baseInput.entries] });
		expect(a).toEqual(b);
	});

	it("changes when an entry's mtime changes", () => {
		const a = computeRenderSignature(baseInput);
		const b = computeRenderSignature({
			...baseInput,
			entries: [
				{ path: "A.md", mtime: 999 },
				{ path: "B.md", mtime: 2 },
			],
		});
		expect(a.entries).not.toBe(b.entries);
		expect(a.order).toBe(b.order);
	});

	it("is insensitive to config key order", () => {
		const a = computeRenderSignature({ ...baseInput, config: { a: 1, b: 2 } });
		const b = computeRenderSignature({ ...baseInput, config: { b: 2, a: 1 } });
		expect(a.config).toBe(b.config);
	});
});

describe("diffRenderSignatures", () => {
	it("reports every layer changed on the first render (prev === null)", () => {
		const diff = diffRenderSignatures(null, computeRenderSignature(baseInput));
		expect(diff).toEqual({
			entriesChanged: true,
			orderChanged: true,
			groupsChanged: true,
			configChanged: true,
			identical: false,
		});
	});

	it("reports identical for two computations of the same input", () => {
		const sig = computeRenderSignature(baseInput);
		expect(diffRenderSignatures(sig, computeRenderSignature(baseInput)).identical).toBe(true);
	});

	it("isolates which layer changed: order changing does not report entries/groups changed", () => {
		const prev = computeRenderSignature(baseInput);
		const next = computeRenderSignature({ ...baseInput, order: ["note.status"] });
		expect(diffRenderSignatures(prev, next)).toEqual({
			entriesChanged: false,
			orderChanged: true,
			groupsChanged: false,
			configChanged: false,
			identical: false,
		});
	});

	it("isolates a group-key change from everything else", () => {
		const prev = computeRenderSignature(baseInput);
		const next = computeRenderSignature({ ...baseInput, groupKeys: ["Doing"] });
		expect(diffRenderSignatures(prev, next)).toMatchObject({
			entriesChanged: false,
			orderChanged: false,
			groupsChanged: true,
		});
	});
});
