// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readRepoJson = (name) => JSON.parse(readFileSync(path.join(repoRoot, name), "utf8"));

describe("manifest compatibility and naming", () => {
	it("declares the minimum supported Obsidian version", () => {
		const manifest = readRepoJson("manifest.json");
		expect(manifest.minAppVersion).toBe("1.14.4");
	});

	it("describes the plugin's current views without stale Kanban naming", () => {
		const manifest = readRepoJson("manifest.json");
		const pkg = readRepoJson("package.json");
		expect(manifest.description).not.toMatch(/kanban/i);
		expect(pkg.description).not.toMatch(/kanban/i);
		expect(pkg.keywords).not.toContain("kanban");
		expect(pkg.keywords).toContain("swimlane");
	});
});
