// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { createGrantedMutations } from "../src/platform/mutations/grants";
import { LegacyMutationGateway } from "../src/platform/mutations/LegacyMutationGateway";
import { TFile } from "./fixtures/obsidian";

interface MockAppOptions {
	existingFiles?: string[];
	existingFolders?: string[];
	throwOnProcessFrontMatter?: boolean;
}

function makeApp(options: MockAppOptions = {}) {
	const files = new Set(options.existingFiles ?? []);
	const folders = new Set(options.existingFolders ?? []);
	const frontmatterWrites: Array<{ path: string; values: Record<string, unknown> }> = [];
	const trashed: string[] = [];
	const created: Array<{ path: string; content: string }> = [];
	const createdFolders: string[] = [];
	const renamed: Array<{ from: string; to: string }> = [];
	const makeFile = (path: string) => {
		const file = new TFile(path) as TFile & {
			name: string;
			extension: string;
			parent: { path: string } | null;
		};
		file.name = path.split("/").pop() ?? path;
		file.extension = file.name.includes(".") ? (file.name.split(".").pop() ?? "") : "";
		file.parent = { path: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "" };
		return file;
	};

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => {
				if (files.has(path)) return makeFile(path);
				if (folders.has(path)) return { path } as never;
				return null;
			},
			createFolder: async (path: string) => {
				createdFolders.push(path);
				folders.add(path);
			},
			create: async (path: string, content: string) => {
				created.push({ path, content });
				files.add(path);
				return new TFile(path);
			},
		},
		fileManager: {
			processFrontMatter: async (file: TFile, fn: (fm: Record<string, unknown>) => void) => {
				if (options.throwOnProcessFrontMatter) throw new Error("disk error");
				const values: Record<string, unknown> = {};
				fn(values);
				frontmatterWrites.push({ path: file.path, values });
			},
			trashFile: async (file: TFile) => {
				trashed.push(file.path);
			},
			renameFile: async (file: TFile, path: string) => {
				renamed.push({ from: file.path, to: path });
				files.delete(file.path);
				files.add(path);
			},
		},
	} as unknown as App;

	return { app, frontmatterWrites, trashed, created, createdFolders, renamed };
}

describe("LegacyMutationGateway.setProperty", () => {
	it("writes the property's bare name to frontmatter, keyed by path", async () => {
		const { app, frontmatterWrites } = makeApp({ existingFiles: ["Tasks/A.md"] });
		const result = await new LegacyMutationGateway(app).setProperty(
			"Tasks/A.md",
			"note.status",
			"Done",
		);
		expect(result).toEqual({ ok: true });
		expect(frontmatterWrites).toEqual([{ path: "Tasks/A.md", values: { status: "Done" } }]);
	});

	it("rejects a formula property before touching the vault", async () => {
		const { app, frontmatterWrites } = makeApp({ existingFiles: ["Tasks/A.md"] });
		const result = await new LegacyMutationGateway(app).setProperty(
			"Tasks/A.md",
			"formula.status",
			"Done",
		);
		expect(result).toEqual({ ok: false, reason: "formula-property", message: expect.any(String) });
		expect(frontmatterWrites).toEqual([]);
	});

	it("fails deterministically for a path with no file", async () => {
		const { app } = makeApp();
		const result = await new LegacyMutationGateway(app).setProperty(
			"Missing.md",
			"note.status",
			"Done",
		);
		expect(result).toEqual({ ok: false, reason: "file-not-found", message: expect.any(String) });
	});

	it("reports a stable error result instead of throwing when the write itself fails", async () => {
		const { app } = makeApp({ existingFiles: ["Tasks/A.md"], throwOnProcessFrontMatter: true });
		const result = await new LegacyMutationGateway(app).setProperty(
			"Tasks/A.md",
			"note.status",
			"Done",
		);
		expect(result).toEqual({ ok: false, reason: "error", message: "disk error" });
	});
});

describe("LegacyMutationGateway.updateRange", () => {
	it("writes both start and end properties in one call", async () => {
		const { app, frontmatterWrites } = makeApp({ existingFiles: ["A.md"] });
		const result = await new LegacyMutationGateway(app).updateRange(
			"A.md",
			"note.start",
			"2026-01-01",
			"note.end",
			"2026-01-02",
		);
		expect(result).toEqual({ ok: true });
		expect(frontmatterWrites).toEqual([
			{ path: "A.md", values: { start: "2026-01-01", end: "2026-01-02" } },
		]);
	});

	it("rejects the whole write when either date property is a formula", async () => {
		const { app, frontmatterWrites } = makeApp({ existingFiles: ["A.md"] });
		const result = await new LegacyMutationGateway(app).updateRange(
			"A.md",
			"note.start",
			"2026-01-01",
			"formula.end",
			"2026-01-02",
		);
		expect(result.ok).toBe(false);
		expect(frontmatterWrites).toEqual([]);
	});
});

describe("LegacyMutationGateway Swimlane movement", () => {
	it("writes multiple card properties atomically", async () => {
		const { app, frontmatterWrites } = makeApp({ existingFiles: ["Tasks/A.md"] });
		const result = await new LegacyMutationGateway(app).setProperties("Tasks/A.md", {
			"note.status": "Done",
			"note.priority": "High",
		});
		expect(result).toEqual({ ok: true });
		expect(frontmatterWrites).toEqual([
			{ path: "Tasks/A.md", values: { status: "Done", priority: "High" } },
		]);
	});

	it("creates the target folder and returns the renamed path", async () => {
		const { app, createdFolders, renamed } = makeApp({ existingFiles: ["Tasks/A.md"] });
		const result = await new LegacyMutationGateway(app).moveToFolder("Tasks/A.md", "Archive");
		expect(result).toEqual({ ok: true, path: "Archive/A.md" });
		expect(createdFolders).toEqual(["Archive"]);
		expect(renamed).toEqual([{ from: "Tasks/A.md", to: "Archive/A.md" }]);
	});
});

describe("LegacyMutationGateway.setDependencies", () => {
	it("writes the dependency string as a plain property", async () => {
		const { app, frontmatterWrites } = makeApp({ existingFiles: ["A.md"] });
		const result = await new LegacyMutationGateway(app).setDependencies(
			"A.md",
			"note.depends_on",
			"task-b, task-c",
		);
		expect(result).toEqual({ ok: true });
		expect(frontmatterWrites).toEqual([{ path: "A.md", values: { depends_on: "task-b, task-c" } }]);
	});
});

describe("LegacyMutationGateway.trash", () => {
	it("trashes the resolved file by path", async () => {
		const { app, trashed } = makeApp({ existingFiles: ["A.md"] });
		const result = await new LegacyMutationGateway(app).trash("A.md");
		expect(result).toEqual({ ok: true });
		expect(trashed).toEqual(["A.md"]);
	});

	it("fails deterministically for a path with no file", async () => {
		const { app } = makeApp();
		const result = await new LegacyMutationGateway(app).trash("Missing.md");
		expect(result).toEqual({ ok: false, reason: "file-not-found", message: expect.any(String) });
	});
});

describe("LegacyMutationGateway.createNote", () => {
	it("creates parent folders that don't exist yet, then the note", async () => {
		const { app, created, createdFolders } = makeApp();
		const result = await new LegacyMutationGateway(app).createNote({
			path: "Journal/2026-01-01.md",
			frontmatter: { start: "2026-01-01" },
		});
		expect(result).toEqual({ ok: true });
		expect(createdFolders).toEqual(["Journal"]);
		expect(created[0]?.path).toBe("Journal/2026-01-01.md");
	});

	it("does not recreate an existing parent folder", async () => {
		const { app, createdFolders } = makeApp({ existingFolders: ["Journal"] });
		await new LegacyMutationGateway(app).createNote({ path: "Journal/A.md" });
		expect(createdFolders).toEqual([]);
	});
});

describe("createGrantedMutations (GBETA-003)", () => {
	it("builds nothing for an empty grant list", () => {
		const { app } = makeApp();
		expect(createGrantedMutations(app, [])).toEqual({});
	});

	it("exposes only the granted capabilities, each with only its own methods", () => {
		const { app } = makeApp();
		const granted = createGrantedMutations(app, ["property", "dependency"]);

		expect(Object.keys(granted).sort()).toEqual(["dependency", "property"]);
		expect(Object.keys(granted.property ?? {}).sort()).toEqual(["setProperties", "setProperty"]);
		expect(Object.keys(granted.dependency ?? {})).toEqual(["setDependencies"]);
		expect(granted).not.toHaveProperty("date");
		expect(granted.property).not.toHaveProperty("trash");
		expect(granted.property).not.toHaveProperty("moveToFolder");
	});

	it("delegates a granted write to the gateway's validated path", async () => {
		const { app, frontmatterWrites } = makeApp({ existingFiles: ["Tasks/A.md"] });
		const granted = createGrantedMutations(app, ["property"]);

		await expect(granted.property?.setProperty("Tasks/A.md", "note.progress", 40)).resolves.toEqual(
			{ ok: true },
		);
		await expect(
			granted.property?.setProperty("Tasks/A.md", "formula.x", 1),
		).resolves.toMatchObject({
			ok: false,
			reason: "formula-property",
		});
		expect(frontmatterWrites).toEqual([{ path: "Tasks/A.md", values: { progress: 40 } }]);
	});
});
