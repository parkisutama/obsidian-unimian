// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Finds the `.base` file (or, for an embedded Base, the note embedding it) hosting a Sticky Note
 * view instance — needed to scope pinned state per Base (spec §5.1).
 *
 * `BasesView`/`QueryController`/`BasesViewConfig` expose no file path in the public API
 * (checked against obsidian.d.ts, 2026-09-22: `BasesViewFactory` only receives a `QueryController`
 * and a bare `containerEl`). This instead walks every open leaf via the documented
 * `Workspace.iterateAllLeaves()`, finds the one whose `view.containerEl` contains this view's
 * `containerEl`, and reads `FileView.file` — both public API, no private/internal property
 * access. An embedded Base (`![[Foo.base]]` inside another note) resolves to the embedding
 * note's path, not `Foo.base`'s — an accepted limitation, not a bug: the mapping is still
 * stable and scoped to *something* real, just one level up from the ideal in that one case.
 */

import { FileView, type App, type TFile } from 'obsidian';

export function findOwningBaseFile(app: App, containerEl: HTMLElement): TFile | null {
	let found: TFile | null = null;
	app.workspace.iterateAllLeaves((leaf) => {
		if (found) return;
		const view = leaf.view;
		if (view instanceof FileView && view.file && view.containerEl.contains(containerEl)) {
			found = view.file;
		}
	});
	return found;
}
