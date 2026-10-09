// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { assertInsideVault, escapesVault } from "../src/core/paths/vaultPath";
import { LegacyMutationGateway } from "../src/platform/mutations/LegacyMutationGateway";
import { TFile } from "./fixtures/obsidian";

describe("escapesVault", () => {
	it.each([
		"../Outside.md",
		"Notes/../../Outside.md",
		"Notes/..",
		"..",
		"Notes\\..\\..\\Outside.md",
	])("flags %s", (path) => {
		expect(escapesVault(path)).toBe(true);
	});

	it.each([
		"",
		"Note.md",
		"Notes/Sub/Note.md",
		"Notes/..hidden/Note.md",
		"Notes/a..b.md",
		"Notes/.../Note.md",
	])("accepts %s", (path) => {
		expect(escapesVault(path)).toBe(false);
	});
});

describe("assertInsideVault", () => {
	it("throws with the offending path", () => {
		expect(() => assertInsideVault("Notes/../../Outside.md")).toThrow(
			'Path leaves the vault: "Notes/../../Outside.md"',
		);
	});

	it("returns the path when it stays inside", () => {
		expect(assertInsideVault("Notes/Note.md")).toBe("Notes/Note.md");
	});
});

function makeApp(existingFiles: string[] = []) {
	const calls: string[] = [];
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) =>
				existingFiles.includes(path)
					? Object.assign(new TFile(path), {
							name: path.split("/").pop(),
							parent: { path: "" },
						})
					: null,
			createFolder: async (path: string) => {
				calls.push(`createFolder ${path}`);
			},
			create: async (path: string) => {
				calls.push(`create ${path}`);
			},
		},
		fileManager: {
			renameFile: async (_file: TFile, path: string) => {
				calls.push(`rename ${path}`);
			},
		},
		plugins: { plugins: {} },
		internalPlugins: { getPluginById: () => null },
	} as unknown as App;
	return { app, calls };
}

describe("LegacyMutationGateway refuses paths that leave the vault", () => {
	it("does not create a note outside the vault", async () => {
		const { app, calls } = makeApp();
		const result = await new LegacyMutationGateway(app).createNote({ path: "../Outside.md" });
		expect(result).toMatchObject({
			ok: false,
			message: expect.stringContaining("leaves the vault"),
		});
		expect(calls).toEqual([]);
	});

	it("does not move a note to a folder outside the vault", async () => {
		const { app, calls } = makeApp(["A.md"]);
		const result = await new LegacyMutationGateway(app).moveToFolder("A.md", "../Outside");
		expect(result).toMatchObject({
			ok: false,
			message: expect.stringContaining("leaves the vault"),
		});
		expect(calls).toEqual([]);
	});
});
