// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildLicenseBanner,
	collectBundledPackages,
	findUnlistedPackages,
	requiredNoticeFragments,
} from "../scripts/license-banner.mjs";
import { verifyBuildArtifacts } from "../scripts/verify-build-artifacts.mjs";

const tempDirs = [];

function makeTempDir() {
	const cwd = mkdtempSync(path.join(tmpdir(), "unimian-artifacts-"));
	tempDirs.push(cwd);
	return cwd;
}

function writeValidArtifacts(cwd) {
	writeFileSync(path.join(cwd, "main.js"), `${buildLicenseBanner("main.js", "1.0.0")}ok\n`);
	writeFileSync(path.join(cwd, "manifest.json"), "ok\n");
	writeFileSync(path.join(cwd, "styles.css"), `${buildLicenseBanner("styles.css")}ok\n`);
}

afterEach(() => {
	while (tempDirs.length > 0) {
		rmSync(tempDirs.pop(), { recursive: true, force: true });
	}
});

describe("verifyBuildArtifacts", () => {
	it("passes when all required plugin artifacts exist, are non-empty, and carry license notices", () => {
		const cwd = makeTempDir();
		writeValidArtifacts(cwd);

		expect(verifyBuildArtifacts({ cwd }).ok).toBe(true);
	});

	it("reports missing and empty artifacts", () => {
		const cwd = makeTempDir();
		writeFileSync(path.join(cwd, "main.js"), "");
		writeFileSync(path.join(cwd, "manifest.json"), "ok\n");

		expect(verifyBuildArtifacts({ cwd })).toEqual({
			ok: false,
			missing: ["styles.css"],
			empty: ["main.js"],
			missingNotices: {},
		});
	});

	it("reports distributed files without a license banner", () => {
		const cwd = makeTempDir();
		writeValidArtifacts(cwd);
		writeFileSync(path.join(cwd, "main.js"), "ok\n");

		const result = verifyBuildArtifacts({ cwd });
		expect(result.ok).toBe(false);
		expect(result.missingNotices).toEqual({ "main.js": requiredNoticeFragments("main.js") });
	});
});

describe("buildLicenseBanner", () => {
	it("lists only components shipped in the given file", () => {
		const css = buildLicenseBanner("styles.css");
		expect(css.startsWith("/*!")).toBe(true);
		expect(css).toContain("Gantt Chart (MIT)");
		expect(css).not.toContain("Frappe");
		expect(css).not.toContain("Preact");

		const js = buildLicenseBanner("main.js", "1.2.3");
		expect(js).toContain("Unimian v1.2.3");
		for (const fragment of requiredNoticeFragments("main.js")) {
			expect(js).toContain(fragment);
		}
	});
});

describe("collectBundledPackages / findUnlistedPackages", () => {
	const metafile = {
		outputs: {
			"main.js": {
				inputs: {
					"src/main.ts": { bytesInOutput: 10 },
					"node_modules/.pnpm/fullcalendar@7.1.0_x/node_modules/fullcalendar/index.js": {
						bytesInOutput: 5,
					},
					"node_modules/.pnpm/@scope+pkg@1.0.0/node_modules/@scope/pkg/index.js": {
						bytesInOutput: 5,
					},
					"node_modules/.pnpm/types-only@1.0.0/node_modules/types-only/index.js": {
						bytesInOutput: 0,
					},
				},
			},
		},
	};
	const versions = { fullcalendar: "7.1.0", "@scope/pkg": "1.0.0" };
	const readPackageJson = (dir) => ({ version: versions[dir.split("node_modules/").pop()] });

	it("collects scoped and unscoped packages that contribute bytes", () => {
		expect([...collectBundledPackages(metafile, readPackageJson)]).toEqual([
			["fullcalendar", "7.1.0"],
			["@scope/pkg", "1.0.0"],
		]);
	});

	it("reports unknown packages and versions missing from the notices", () => {
		const bundled = collectBundledPackages(metafile, readPackageJson);
		expect(findUnlistedPackages(bundled, "`fullcalendar@7.1.0`")).toEqual([
			"@scope/pkg@1.0.0 is bundled but not listed in scripts/license-banner.mjs",
		]);
		expect(
			findUnlistedPackages(new Map([["fullcalendar", "7.2.0"]]), "`fullcalendar@7.1.0`"),
		).toEqual([
			"fullcalendar@7.2.0 is bundled but THIRD_PARTY_NOTICES.md does not list that version",
		]);
	});
});
