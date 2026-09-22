// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Pure operations on `StickyNoteData.pinnedByBase` (spec docs/specs/sticky-note.md §5.1).
 *
 * Pinned state is exclusive to Sticky Note and lives only in the plugin's own `data.json` —
 * never a note property. Scoped per `.base` file (outer key) so the same note can be pinned in
 * one Base and not another. Every function here is pure; callers own persisting the result via
 * `plugin.saveSettings()`.
 */

import type { StickyNoteData } from '../../types/settings';

export function isPinned(data: StickyNoteData, basePath: string, notePath: string): boolean {
	return data.pinnedByBase[basePath]?.includes(notePath) ?? false;
}

/** Returns a new `StickyNoteData` with `notePath` pinned/unpinned in `basePath`'s set. */
export function togglePin(data: StickyNoteData, basePath: string, notePath: string): StickyNoteData {
	const current = data.pinnedByBase[basePath] ?? [];
	const next = current.includes(notePath) ? current.filter((path) => path !== notePath) : [...current, notePath];
	const pinnedByBase = { ...data.pinnedByBase };
	if (next.length > 0) {
		pinnedByBase[basePath] = next;
	} else {
		delete pinnedByBase[basePath];
	}
	return { ...data, pinnedByBase };
}

/**
 * Rewrites every occurrence of `oldPath` to `newPath`, both as a pinned note path (values) and
 * as a Base file path (an outer key) — so renaming/moving either side of the mapping does not
 * silently drop a pin. Returns the same reference when nothing matched (no-op case is cheap to
 * detect and avoids an unnecessary `saveSettings()` write).
 */
export function migratePath(data: StickyNoteData, oldPath: string, newPath: string): StickyNoteData {
	let changed = false;
	const pinnedByBase: Record<string, string[]> = {};

	for (const [basePath, notePaths] of Object.entries(data.pinnedByBase)) {
		const migratedBasePath = basePath === oldPath ? newPath : basePath;
		const migratedNotePaths = notePaths.map((path) => (path === oldPath ? newPath : path));
		if (migratedBasePath !== basePath || migratedNotePaths.some((path, i) => path !== notePaths[i])) changed = true;

		const existing = pinnedByBase[migratedBasePath] ?? [];
		pinnedByBase[migratedBasePath] = [...new Set([...existing, ...migratedNotePaths])];
	}

	return changed ? { ...data, pinnedByBase } : data;
}

/**
 * Drops pinned-note paths and Base-file keys that no longer exist in the vault. Called lazily
 * (e.g. on plugin load), not reactively on every delete — a stale pinned-path is harmless (it
 * simply never matches an entry), so eager cleanup is not required for correctness.
 */
export function pruneMissing(data: StickyNoteData, exists: (path: string) => boolean): StickyNoteData {
	let changed = false;
	const pinnedByBase: Record<string, string[]> = {};

	for (const [basePath, notePaths] of Object.entries(data.pinnedByBase)) {
		if (!exists(basePath)) {
			changed = true;
			continue;
		}
		const kept = notePaths.filter((path) => exists(path));
		if (kept.length !== notePaths.length) changed = true;
		if (kept.length > 0) pinnedByBase[basePath] = kept;
		else changed = true;
	}

	return changed ? { ...data, pinnedByBase } : data;
}
