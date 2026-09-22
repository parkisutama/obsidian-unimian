// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Backlink lookup for the quick preview popup.
 *
 * Deliberately uses only the documented `MetadataCache.resolvedLinks` map (source path -> target
 * path -> link count) rather than the undocumented `getBacklinksForFile` API, so this stays a
 * stable read against the public Obsidian API surface.
 */

import type { App } from 'obsidian';

export interface BacklinkEntry {
	path: string;
	basename: string;
}

/** Every note that links to `path`, sorted by basename and capped to keep the panel scannable. */
export function getBacklinkPaths(app: App, path: string, limit = 20): BacklinkEntry[] {
	const resolvedLinks = app.metadataCache.resolvedLinks;
	const entries: BacklinkEntry[] = [];

	for (const sourcePath of Object.keys(resolvedLinks)) {
		if (sourcePath === path) continue;
		const targets = resolvedLinks[sourcePath];
		if (targets && path in targets) {
			const basename = sourcePath.slice(sourcePath.lastIndexOf('/') + 1).replace(/\.md$/, '');
			entries.push({ path: sourcePath, basename });
		}
	}

	entries.sort((a, b) => a.basename.localeCompare(b.basename));
	return entries.slice(0, limit);
}
