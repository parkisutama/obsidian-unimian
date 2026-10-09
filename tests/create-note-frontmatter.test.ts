// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { LegacyMutationGateway } from "../src/platform/mutations/LegacyMutationGateway";

// The test double's `stringifyYaml` returns nothing. Stand in for Obsidian's serializer with one
// whose output is recognisable and always valid YAML (JSON keys and values), so these tests can
// tell "went through the serializer" apart from "was concatenated by hand".
vi.mock("obsidian", async (importOriginal) => ({
	...(await importOriginal<typeof import("obsidian")>()),
	stringifyYaml: (value: Record<string, unknown>) =>
		Object.entries(value)
			.map(([key, entry]) => `${JSON.stringify(key)}: ${JSON.stringify(entry)}\n`)
			.join(""),
}));

function makeApp() {
	const created: Array<{ path: string; content: string }> = [];
	const app = {
		vault: {
			getAbstractFileByPath: () => null,
			createFolder: async () => {},
			create: async (path: string, content: string) => {
				created.push({ path, content });
			},
		},
		// No Templater, no core Templates plugin: the plain creation path.
		plugins: { plugins: {} },
		internalPlugins: { getPluginById: () => null },
	} as unknown as App;
	return { app, created };
}

async function createdContent(request: {
	frontmatter?: Record<string, unknown>;
	body?: string;
}): Promise<string> {
	const { app, created } = makeApp();
	const result = await new LegacyMutationGateway(app).createNote({ path: "A.md", ...request });
	expect(result).toEqual({ ok: true });
	return created[0]?.content ?? "";
}

describe("LegacyMutationGateway.createNote frontmatter", () => {
	it("writes frontmatter through Obsidian's YAML serializer", async () => {
		const content = await createdContent({ frontmatter: { start: "2026-01-01", done: false } });
		expect(content).toBe('---\n"start": "2026-01-01"\n"done": false\n---\n');
	});

	it("keeps a property name with a colon as one key", async () => {
		const content = await createdContent({ frontmatter: { "due: soon": 1 } });
		expect(content).toBe('---\n"due: soon": 1\n---\n');
	});

	it("cannot be made to add a property through a name containing a line break", async () => {
		const content = await createdContent({ frontmatter: { "a\ninjected: true\nb": 1 } });
		expect(content.split("\n")).toEqual(["---", '"a\\ninjected: true\\nb": 1', "---", ""]);
	});

	it("puts the body after the frontmatter block, unchanged", async () => {
		const content = await createdContent({ frontmatter: { a: 1 }, body: "\nText\n" });
		expect(content).toBe('---\n"a": 1\n---\n\nText\n');
	});

	it("writes no frontmatter block when there are no properties", async () => {
		expect(await createdContent({ body: "Text" })).toBe("Text");
		expect(await createdContent({ frontmatter: {}, body: "Text" })).toBe("Text");
	});
});
