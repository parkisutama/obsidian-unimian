// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import esbuild from "esbuild";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";
import {
	BUNDLE_MARKER,
	composeStyles,
	createCssMergePlugin,
	packageLicenseNotice,
} from "../scripts/css-merge.mjs";

const fixtures = fileURLToPath(new URL("./fixtures/css-merge/", import.meta.url));
const tempDirs = [];
const makeTempDir = () => {
	const dir = mkdtempSync(path.join(tmpdir(), "unimian-css-"));
	tempDirs.push(dir);
	return dir;
};

afterEach(() => {
	while (tempDirs.length > 0) {
		rmSync(tempDirs.pop(), { recursive: true, force: true });
	}
});

const BANNER = "/*! Test banner */\n";

/** Build the fixture entry with the css-merge plugin, writing into a temp styles.css. */
async function buildFixture({
	existingStyles = "",
	extraCss = [],
	firstPartyCss,
	rebuilds = 1,
} = {}) {
	const dir = makeTempDir();
	const stylesPath = path.join(dir, "styles.css");
	writeFileSync(stylesPath, existingStyles);
	const context = await esbuild.context({
		entryPoints: [path.join(fixtures, "entry.js")],
		bundle: true,
		write: false,
		logLevel: "silent",
		plugins: [
			createCssMergePlugin({
				stylesPath,
				banner: BANNER,
				bannerStart: "/*! Test banner",
				extraCss,
				firstPartyCss,
				log: () => {},
			}),
		],
	});
	try {
		for (let i = 0; i < rebuilds; i++) {
			await context.rebuild();
		}
	} finally {
		await context.dispose();
	}
	return readFileSync(stylesPath, "utf8");
}

const count = (text, needle) => text.split(needle).length - 1;

describe("packageLicenseNotice", () => {
	it("reads name, version, license, and copyright from the owning package", () => {
		expect(packageLicenseNotice(path.join(fixtures, "pkg-a", "a.css"))).toBe(
			"/*! pkg-a v1.2.3 | MIT License | Copyright (c) 2020 Alice Example | From: a.css */",
		);
	});

	it("finds LICENSE.txt, keeps scoped names, and appends a note", () => {
		expect(packageLicenseNotice(path.join(fixtures, "pkg-b", "b.css"), "Modified")).toBe(
			"/*! @scope/pkg-b v4.5.6 | Apache-2.0 License | Copyright 2021 Bob Example | Modified | From: b.css */",
		);
	});

	it("falls back to the file name outside any package", () => {
		const dir = makeTempDir();
		const cssPath = path.join(dir, "orphan.css");
		writeFileSync(cssPath, ".x{}");
		expect(packageLicenseNotice(cssPath)).toBe("/* From: orphan.css */");
	});
});

describe("composeStyles", () => {
	const base = {
		banner: BANNER,
		bannerStart: "/*! Test banner",
		extras: [],
		extraPaths: new Set(),
	};

	it("sorts imports by path whatever order they finished loading in", () => {
		const styles = composeStyles({
			...base,
			existing: ".mine {}",
			imported: [
				{ path: "/n/fullcalendar/themes/classic/theme.css", css: ".theme {}" },
				{ path: "/n/fullcalendar/skeleton.css", css: ".skeleton {}" },
				{ path: "/n/fullcalendar/themes/classic/palette.css", css: ".palette {}" },
			],
		});
		const order = [".skeleton {}", ".palette {}", ".theme {}"].map((css) => styles.indexOf(css));
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});

	it("puts extras first and drops imports of the same file", () => {
		const styles = composeStyles({
			...base,
			existing: "",
			extras: [".vendor-transformed {}"],
			extraPaths: new Set(["/n/vendor.css"]),
			imported: [
				{ path: "/n/vendor.css", css: ".vendor-raw {}" },
				{ path: "/n/other.css", css: ".other {}" },
			],
		});
		expect(styles).not.toContain(".vendor-raw {}");
		expect(styles.indexOf(".vendor-transformed {}")).toBeLessThan(styles.indexOf(".other {}"));
	});

	it("returns null when there is nothing to merge", () => {
		expect(composeStyles({ ...base, existing: ".mine {}", imported: [] })).toBeNull();
	});

	it("uses firstParty verbatim, ignoring whatever precedes the marker in existing", () => {
		const styles = composeStyles({
			...base,
			existing: ".stale-hand-written {}",
			firstParty: ".foundations {}\n\n.views {}\n",
			imported: [],
		});
		expect(styles).not.toBeNull();
		expect(styles).not.toContain(".stale-hand-written {}");
		expect(styles).toContain(".foundations {}\n\n.views {}");
	});

	it("preserves firstParty's given order even though it isn't path-sorted", () => {
		const styles = composeStyles({
			...base,
			existing: "",
			firstParty: ".z-module {}\n\n.a-module {}\n",
			imported: [],
		});
		expect(styles.indexOf(".z-module {}")).toBeLessThan(styles.indexOf(".a-module {}"));
	});
});

describe("createCssMergePlugin", () => {
	it("appends imported CSS after the marker, each with its license notice", async () => {
		const styles = await buildFixture({ existingStyles: ".mine { color: black; }\n" });
		const [head, bundled] = styles.split(BUNDLE_MARKER);
		expect(head).toContain(".mine { color: black; }");
		expect(bundled).toContain("/*! pkg-a v1.2.3 | MIT License");
		expect(bundled).toContain(".a { color: red; }");
		expect(bundled).toContain("/*! @scope/pkg-b v4.5.6 | Apache-2.0 License");
		expect(bundled).toContain(".b { color: blue; }");
	});

	it("orders merged CSS by path, not by import order", async () => {
		const styles = await buildFixture();
		expect(styles.indexOf(".a { color: red; }")).toBeLessThan(
			styles.indexOf(".b { color: blue; }"),
		);
	});

	it("produces identical output across builds", async () => {
		const outputs = await Promise.all([buildFixture(), buildFixture(), buildFixture()]);
		expect(new Set(outputs).size).toBe(1);
	});

	it("does not duplicate imports across watch-mode rebuilds", async () => {
		const styles = await buildFixture({ rebuilds: 3 });
		expect(count(styles, ".a { color: red; }")).toBe(1);
		expect(count(styles, ".b { color: blue; }")).toBe(1);
		expect(count(styles, BUNDLE_MARKER)).toBe(1);
	});

	it("replaces the previous bundled section and banner instead of stacking them", async () => {
		const once = await buildFixture({ existingStyles: ".mine {}\n" });
		const dir = makeTempDir();
		const stylesPath = path.join(dir, "styles.css");
		writeFileSync(stylesPath, once);
		const context = await esbuild.context({
			entryPoints: [path.join(fixtures, "entry.js")],
			bundle: true,
			write: false,
			logLevel: "silent",
			plugins: [
				createCssMergePlugin({
					stylesPath,
					banner: BANNER,
					bannerStart: "/*! Test banner",
					log: () => {},
				}),
			],
		});
		await context.rebuild();
		await context.dispose();
		const twice = readFileSync(stylesPath, "utf8");
		expect(twice).toBe(once);
		expect(twice.startsWith(BANNER)).toBe(true);
		expect(count(twice, "/*! Test banner")).toBe(1);
	});

	it("concatenates ordered first-party CSS modules verbatim, in the given order", async () => {
		const styles = await buildFixture({
			existingStyles: ".stale-hand-written {}",
			firstPartyCss: [
				path.join(fixtures, "first-party", "foundations.css"),
				path.join(fixtures, "first-party", "views.css"),
			],
		});
		const head = styles.split(BUNDLE_MARKER)[0];
		expect(head).not.toContain(".stale-hand-written {}");
		expect(head.indexOf(".foundations")).toBeLessThan(head.indexOf(".views"));
	});

	it("produces byte-identical output for the same ordered first-party modules across builds", async () => {
		const firstPartyCss = [
			path.join(fixtures, "first-party", "foundations.css"),
			path.join(fixtures, "first-party", "views.css"),
		];
		const outputs = await Promise.all([
			buildFixture({ firstPartyCss }),
			buildFixture({ firstPartyCss }),
		]);
		expect(new Set(outputs).size).toBe(1);
	});

	it("injects extra vendor CSS first, transformed and annotated", async () => {
		const styles = await buildFixture({
			extraCss: [
				{
					path: path.join(fixtures, "pkg-b", "b.css"),
					transform: (css) => css.replace("blue", "var(--accent)"),
					note: "Modified: themed",
				},
			],
		});
		const bundled = styles.split(BUNDLE_MARKER)[1];
		expect(
			bundled
				.trimStart()
				.startsWith(
					"/*! @scope/pkg-b v4.5.6 | Apache-2.0 License | Copyright 2021 Bob Example | Modified: themed",
				),
		).toBe(true);
		expect(bundled).toContain(".b { color: var(--accent); }");
		// The same file imported by the entry is not merged a second time.
		expect(count(bundled, "From: b.css")).toBe(1);
	});
});
