// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyReleaseMetadata } from "../scripts/verify-build-artifacts.mjs";

let rootDir: string;

beforeEach(() => {
	rootDir = mkdtempSync(path.join(tmpdir(), "unimian-metadata-"));
	mkdirSync(path.join(rootDir, "dist"));
});

afterEach(() => {
	rmSync(rootDir, { recursive: true, force: true });
});

function writeMetadata({
	manifest = { id: "unimian", version: "0.2.0", minAppVersion: "1.14.4" },
	packageVersion = "0.2.0",
	versions = { "0.0.1": "1.14.4" } as Record<string, string>,
} = {}) {
	writeFileSync(path.join(rootDir, "dist", "manifest.json"), JSON.stringify(manifest));
	writeFileSync(path.join(rootDir, "package.json"), JSON.stringify({ version: packageVersion }));
	writeFileSync(path.join(rootDir, "versions.json"), JSON.stringify(versions));
}

describe("verifyReleaseMetadata", () => {
	it("accepts matching versions and an inherited minimum app version", () => {
		writeMetadata();
		expect(verifyReleaseMetadata({ rootDir })).toEqual([]);
	});

	it("reports a built manifest whose plugin ID is not unimian", () => {
		writeMetadata({ manifest: { id: "other", version: "0.2.0", minAppVersion: "1.14.4" } });
		expect(verifyReleaseMetadata({ rootDir })).toEqual([
			'manifest.json: id is "other", expected "unimian"',
		]);
	});

	it("reports a manifest version that differs from package.json", () => {
		writeMetadata({ packageVersion: "0.2.1" });
		expect(verifyReleaseMetadata({ rootDir })).toEqual([
			"manifest.json: version 0.2.0 differs from package.json 0.2.1",
		]);
	});

	it("reports a raised minimum app version that has no versions.json entry", () => {
		writeMetadata({ versions: { "0.0.1": "1.14.0" } });
		expect(verifyReleaseMetadata({ rootDir })).toEqual([
			expect.stringMatching(/versions\.json assigns minimum app version 1\.14\.0 to 0\.2\.0/),
		]);
	});
});
