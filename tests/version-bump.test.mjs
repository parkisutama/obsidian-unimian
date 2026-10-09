import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";
import { syncVersionFiles } from "../version-bump.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readRepoJson = (name) => JSON.parse(readFileSync(path.join(repoRoot, name), "utf8"));

const tempDirs = [];

function makeFixture({ manifestVersion = "1.0.0", minAppVersion = "0.15.0" } = {}) {
	const cwd = mkdtempSync(path.join(tmpdir(), "unimian-version-"));
	tempDirs.push(cwd);
	writeFileSync(
		path.join(cwd, "manifest.json"),
		`${JSON.stringify(
			{
				id: "unimian",
				version: manifestVersion,
				minAppVersion,
			},
			null,
			"\t",
		)}\n`,
	);
	writeFileSync(
		path.join(cwd, "versions.json"),
		`${JSON.stringify({ "1.0.0": minAppVersion }, null, "\t")}\n`,
	);
	return cwd;
}

afterEach(() => {
	while (tempDirs.length > 0) {
		rmSync(tempDirs.pop(), { recursive: true, force: true });
	}
});

describe("syncVersionFiles", () => {
	it("syncs manifest.json to the target version", () => {
		const cwd = makeFixture();

		syncVersionFiles({ cwd, targetVersion: "1.1.0" });

		const manifest = JSON.parse(readFileSync(path.join(cwd, "manifest.json"), "utf8"));
		expect(manifest.version).toBe("1.1.0");
	});

	it("always writes versions[targetVersion] to minAppVersion", () => {
		const cwd = makeFixture({ minAppVersion: "0.15.0" });

		syncVersionFiles({ cwd, targetVersion: "1.1.0" });

		const versions = JSON.parse(readFileSync(path.join(cwd, "versions.json"), "utf8"));
		expect(versions).toMatchObject({
			"1.0.0": "0.15.0",
			"1.1.0": "0.15.0",
		});
	});
});

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
