// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

// This file writes the SPDX tag into build output; the markers keep the REUSE linter from
// reading those strings as this file's own license.
// REUSE-IgnoreStart

// License notices prepended to the distributed plugin files.
// Full license texts live in THIRD_PARTY_NOTICES.md; keep both in sync.

export const PROJECT_LICENSE = "GPL-3.0-only";
export const REPOSITORY_URL = "https://github.com/parkisutama/obsidian-unimian";

export const PROJECT_COPYRIGHTS = [
	"Copyright (C) 2025 Sawyer Rensel (Planner, https://github.com/SawyerRensel/Planner)",
	"Copyright (C) 2026 Parkis Utama",
];

// `files` lists the distributed files that contain code from each component.
// `packages` lists the npm packages esbuild bundles for it. The production build fails when it
// bundles a package that is missing here, or whose `name@version` is missing from
// THIRD_PARTY_NOTICES.md (see findUnlistedPackages).
export const THIRD_PARTY_COMPONENTS = [
	{
		name: "obsidian-bases-gantt",
		license: "MIT",
		copyright: "Copyright (c) 2026 Lars Tray",
		files: ["main.js", "styles.css"],
		packages: [],
	},
	{
		name: "FullCalendar",
		license: "MIT",
		copyright: "Copyright (c) 2026 Adam Shaw",
		files: ["main.js", "styles.css"],
		packages: ["fullcalendar", "@full-ui/headless-calendar", "temporal-polyfill", "temporal-utils"],
	},
	{
		name: "Preact",
		license: "MIT",
		copyright: "Copyright (c) 2015-present Jason Miller",
		files: ["main.js"],
		packages: ["preact"],
	},
	{
		name: "Gantt Chart",
		license: "MIT",
		copyright: "Copyright (c) 2025 jaeungkim",
		files: ["main.js", "styles.css"],
		packages: ["@jaeungkim/gantt-chart"],
	},
	// Day.js and Zustand are inlined in @jaeungkim/gantt-chart's dist, so esbuild never sees them
	// as separate packages; they are credited here because their code ships in main.js.
	{
		name: "Day.js",
		license: "MIT",
		copyright: "Copyright (c) 2018-present, iamkun",
		files: ["main.js"],
		packages: [],
	},
	{
		name: "Zustand",
		license: "MIT",
		copyright: "Copyright (c) 2019 Paul Henschel",
		files: ["main.js"],
		packages: [],
	},
];

export const BANNER_START = "/*! Unimian";

/** Build the preserved (`/*!`) license banner for one distributed file. */
export function buildLicenseBanner(file, version) {
	const components = THIRD_PARTY_COMPONENTS.filter((c) => c.files.includes(file));
	const lines = [
		`${BANNER_START}${version ? ` v${version}` : ""} | SPDX-License-Identifier: ${PROJECT_LICENSE}`,
		...PROJECT_COPYRIGHTS,
		`Source: ${REPOSITORY_URL}`,
		"",
		"This file includes third-party software:",
		...components.map((c) => `  ${c.name} (${c.license}) ${c.copyright}`),
		`Full license texts: ${REPOSITORY_URL}/blob/main/THIRD_PARTY_NOTICES.md`,
	];
	return `${lines[0]}\n${lines
		.slice(1)
		.map((line) => (line ? ` * ${line}` : " *"))
		.join("\n")}\n */\n`;
}

/** Return the notice fragments a distributed file must contain. */
export function requiredNoticeFragments(file) {
	return [
		`SPDX-License-Identifier: ${PROJECT_LICENSE}`,
		...PROJECT_COPYRIGHTS,
		...THIRD_PARTY_COMPONENTS.filter((c) => c.files.includes(file)).map(
			(c) => `${c.name} (${c.license}) ${c.copyright}`,
		),
	];
}

/**
 * Collect the npm packages that contributed bytes to an esbuild build, as a name → version map.
 * `readPackageJson(dir)` returns the parsed package.json of a package directory.
 */
export function collectBundledPackages(metafile, readPackageJson) {
	const packages = new Map();
	for (const output of Object.values(metafile.outputs)) {
		for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
			if (bytesInOutput === 0) continue;
			const normalized = input.replaceAll("\\", "/");
			const idx = normalized.lastIndexOf("node_modules/");
			if (idx < 0) continue;
			const parts = normalized.slice(idx + "node_modules/".length).split("/");
			const name = parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
			if (packages.has(name)) continue;
			const dir = normalized.slice(0, idx + "node_modules/".length) + name;
			packages.set(name, readPackageJson(dir).version);
		}
	}
	return packages;
}

/**
 * Describe bundled packages that are not attributed: absent from THIRD_PARTY_COMPONENTS, or whose
 * `name@version` (in backticks) does not appear in THIRD_PARTY_NOTICES.md.
 */
export function findUnlistedPackages(bundledPackages, noticesText) {
	const known = new Set(THIRD_PARTY_COMPONENTS.flatMap((c) => c.packages));
	const problems = [];
	for (const [name, version] of bundledPackages) {
		const id = `${name}@${version}`;
		if (!known.has(name)) {
			problems.push(`${id} is bundled but not listed in scripts/license-banner.mjs`);
		} else if (!noticesText.includes(`\`${id}\``)) {
			problems.push(`${id} is bundled but THIRD_PARTY_NOTICES.md does not list that version`);
		}
	}
	return problems;
}
// REUSE-IgnoreEnd
