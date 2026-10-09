// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { UI_RUNTIME_ALIASES } from "../scripts/ui-runtime-aliases.mjs";

// GBETA-002: Gantt's chart library imports React; the build must resolve every React import
// to Preact so no React code ships (spec docs/specs/gantt.md D1, architecture guard).
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function bundleGanttChart() {
	return esbuild.build({
		stdin: {
			contents: "export { ReactGanttChart } from '@jaeungkim/gantt-chart';",
			resolveDir: repoRoot,
			loader: "js",
		},
		alias: UI_RUNTIME_ALIASES,
		bundle: true,
		write: false,
		metafile: true,
		format: "esm",
		platform: "browser",
		logLevel: "silent",
	});
}

describe("UI runtime aliases", () => {
	it("bundles @jaeungkim/gantt-chart on Preact with no React module", async () => {
		const result = await bundleGanttChart();
		const inputs = Object.keys(result.metafile.inputs).map((p) => p.split(path.sep).join("/"));

		expect(inputs.some((p) => p.includes("@jaeungkim/gantt-chart/dist/"))).toBe(true);
		expect(inputs.some((p) => /\/preact\/compat\//.test(p))).toBe(true);
		expect(inputs.filter((p) => /\/node_modules\/(react|react-dom)\//.test(p))).toEqual([]);
	});

	it("leaves no unresolved React import in the output", async () => {
		const result = await bundleGanttChart();
		const code = result.outputFiles[0].text;

		expect(code).not.toMatch(/from\s*["']react(-dom)?(\/[^"']*)?["']/);
		expect(code).not.toMatch(/require\(\s*["']react(-dom)?(\/[^"']*)?["']\s*\)/);
	});
});
