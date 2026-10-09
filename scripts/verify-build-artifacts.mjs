// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { accessSync, constants, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { requiredNoticeFragments } from "./license-banner.mjs";

export const REQUIRED_BUILD_ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

// Distributed files that must start with a license banner (see scripts/license-banner.mjs).
export const LICENSED_ARTIFACTS = ["main.js", "styles.css"];
const BANNER_SEARCH_LENGTH = 4000;

export function verifyBuildArtifacts({
	cwd = process.cwd(),
	requiredArtifacts = REQUIRED_BUILD_ARTIFACTS,
	licensedArtifacts = LICENSED_ARTIFACTS,
} = {}) {
	const missing = [];
	const empty = [];
	const missingNotices = {};

	for (const artifact of requiredArtifacts) {
		const artifactPath = path.join(cwd, artifact);
		try {
			accessSync(artifactPath, constants.R_OK);
			if (statSync(artifactPath).size === 0) {
				empty.push(artifact);
				continue;
			}
		} catch {
			missing.push(artifact);
			continue;
		}

		if (licensedArtifacts.includes(artifact)) {
			const head = readFileSync(artifactPath, "utf8").slice(0, BANNER_SEARCH_LENGTH);
			const absent = requiredNoticeFragments(artifact).filter(
				(fragment) => !head.includes(fragment),
			);
			if (absent.length > 0) {
				missingNotices[artifact] = absent;
			}
		}
	}

	return {
		ok: missing.length === 0 && empty.length === 0 && Object.keys(missingNotices).length === 0,
		missing,
		empty,
		missingNotices,
	};
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	const result = verifyBuildArtifacts({ cwd: path.join(process.cwd(), "dist") });
	if (!result.ok) {
		console.error("Build artifact verification failed.");
		if (result.missing.length > 0) {
			console.error(`Missing: ${result.missing.join(", ")}`);
		}
		if (result.empty.length > 0) {
			console.error(`Empty: ${result.empty.join(", ")}`);
		}
		for (const [artifact, fragments] of Object.entries(result.missingNotices)) {
			console.error(`Missing license notice in ${artifact}:`);
			for (const fragment of fragments) {
				console.error(`  - ${fragment}`);
			}
		}
		process.exit(1);
	}
	console.log(`Verified build artifacts in dist/: ${REQUIRED_BUILD_ARTIFACTS.join(", ")}`);
}
