// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

// esbuild plugin that merges imported stylesheets into the plugin's styles.css.
// Obsidian loads a single styles.css, so CSS imported from src/ (and extra vendor CSS) is
// appended after BUNDLE_MARKER on every build, each file prefixed with its license notice.

import fs from "fs";
import path from "path";

export const BUNDLE_MARKER = "/* === BUNDLED CSS IMPORTS === */";

/**
 * Build a preserved (/*! *\/) license comment for a CSS file shipped from a package. Name,
 * version, license, and copyright line are read from the package itself so the notice cannot
 * drift from the bundled version.
 */
export function packageLicenseNotice(cssPath, note) {
	let dir = path.dirname(cssPath);
	while (!fs.existsSync(path.join(dir, "package.json"))) {
		const parent = path.dirname(dir);
		if (parent === dir) return `/* From: ${path.basename(cssPath)} */`;
		dir = parent;
	}
	const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
	const licenseFile = fs.readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
	const copyright = licenseFile
		? fs
				.readFileSync(path.join(dir, licenseFile), "utf8")
				.match(/^\s*Copyright.*$/m)?.[0]
				.trim()
		: undefined;
	const parts = [
		`${pkg.name} v${pkg.version}`,
		`${pkg.license} License`,
		copyright,
		note,
		`From: ${path.basename(cssPath)}`,
	].filter(Boolean);
	return `/*! ${parts.join(" | ")} */`;
}

/**
 * Compose the new styles.css: banner, the hand-written part, then extras and imports. Returns
 * null when there is nothing to merge.
 *
 * The hand-written part is `firstParty` verbatim when given (the concatenation, in explicit
 * order, of the first-party CSS source modules under `src/styles/` — see
 * `createCssMergePlugin`'s `firstPartyCss` option); otherwise it falls back to whatever
 * precedes BUNDLE_MARKER in `existing`, minus a previous banner. The fallback exists only for
 * a repository (or test fixture) that has not yet moved its authored CSS into ordered source
 * modules.
 *
 * @param {object} options
 * @param {string} options.existing Current styles.css contents.
 * @param {string} options.banner
 * @param {string} options.bannerStart
 * @param {string[]} options.extras Extra stylesheets (already prefixed with notices), merged first.
 * @param {Set<string>} options.extraPaths Paths of the extras; imports of the same files are dropped.
 * @param {Array<{ path: string, css: string }>} options.imported Imported stylesheets, any order.
 * @param {string} [options.firstParty] Pre-concatenated first-party CSS source modules, verbatim.
 */
export function composeStyles({
	existing,
	banner,
	bannerStart,
	extras,
	extraPaths,
	imported,
	firstParty,
}) {
	let handWritten;
	if (firstParty !== undefined) {
		handWritten = firstParty;
	} else {
		handWritten = existing;

		// Strip any previous bundled CSS section so we always re-merge
		const markerIdx = handWritten.indexOf(BUNDLE_MARKER);
		if (markerIdx >= 0) {
			handWritten = handWritten.substring(0, markerIdx);
		}

		// Replace any previous license banner so it always matches the current one
		if (handWritten.startsWith(bannerStart)) {
			handWritten = handWritten.substring(handWritten.indexOf("*/") + 2).trimStart();
		}
	}

	// onLoad runs concurrently, so sort by path for a deterministic stylesheet;
	// fullcalendar/skeleton.css sorts ahead of fullcalendar/themes/*, as FullCalendar requires.
	const resolvedExtraPaths = new Set([...extraPaths].map((p) => path.resolve(p)));
	const sortedImports = imported
		.filter((entry) => !resolvedExtraPaths.has(path.resolve(entry.path)))
		.sort((a, b) => a.path.localeCompare(b.path))
		.map((entry) => entry.css);

	const merged = [...extras, ...sortedImports];
	// Nothing changed: no bundled CSS to (re)merge, and the hand-written part isn't being
	// regenerated from ordered first-party modules either.
	if (merged.length === 0 && firstParty === undefined) return null;

	// trimEnd keeps the first build identical to later ones (idempotent output).
	const bundledSection = merged.length > 0 ? `\n\n${BUNDLE_MARKER}\n${merged.join("\n\n")}` : "";
	return `${banner}\n${handWritten.trimEnd()}${bundledSection}`;
}

/**
 * @param {object} options
 * @param {string} options.stylesPath styles.css to rewrite.
 * @param {string} options.banner License banner placed at the top of styles.css.
 * @param {string} options.bannerStart Prefix identifying a previous banner to replace.
 * @param {Array<{ path: string, transform?: (css: string) => string, note?: string }>} [options.extraCss]
 *   Stylesheets merged first even when nothing imports them; they replace an import of the same file.
 * @param {string[]} [options.firstPartyCss] First-party CSS source modules (e.g. under
 *   `src/styles/`), read and concatenated in this exact order to form the hand-written part of
 *   styles.css. Order is explicit, not path-sorted, unlike `imported`, because a later module
 *   may intentionally override an earlier one. Omit to keep whatever currently precedes
 *   BUNDLE_MARKER in `stylesPath` (only useful before a repository's CSS has been split into
 *   modules).
 * @param {(message: string) => void} [options.log]
 */
export function createCssMergePlugin({
	stylesPath,
	banner,
	bannerStart,
	extraCss = [],
	firstPartyCss,
	log = console.log,
}) {
	return {
		name: "css-merge",
		setup(build) {
			// Collect CSS from imports as { path, css }
			const imported = [];

			// Start every (re)build empty; in watch mode imports would otherwise accumulate.
			build.onStart(() => {
				imported.length = 0;
			});

			build.onLoad({ filter: /\.css$/ }, async (args) => {
				const css = await fs.promises.readFile(args.path, "utf8");
				imported.push({ path: args.path, css: `${packageLicenseNotice(args.path)}\n${css}` });
				return { contents: "", loader: "js" };
			});

			build.onEnd(async () => {
				const existing = fs.existsSync(stylesPath)
					? await fs.promises.readFile(stylesPath, "utf8")
					: "";

				let firstParty;
				if (firstPartyCss !== undefined) {
					const parts = [];
					for (const modulePath of firstPartyCss) {
						parts.push(await fs.promises.readFile(modulePath, "utf8"));
					}
					firstParty = parts.join("");
				}

				const extras = [];
				for (const extra of extraCss) {
					if (!fs.existsSync(extra.path)) continue;
					const css = await fs.promises.readFile(extra.path, "utf8");
					const transformed = extra.transform ? extra.transform(css) : css;
					extras.push(`${packageLicenseNotice(extra.path, extra.note)}\n${transformed}`);
				}
				const extraPaths = new Set(extraCss.map((extra) => extra.path));

				const styles = composeStyles({
					existing,
					banner,
					bannerStart,
					extras,
					extraPaths,
					imported,
					firstParty,
				});
				if (styles !== null) {
					await fs.promises.writeFile(stylesPath, styles);
					log("Merged CSS imports into styles.css");
				}
			});
		},
	};
}
