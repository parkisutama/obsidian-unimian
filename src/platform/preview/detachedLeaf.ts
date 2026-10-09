// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Embeds a real, editable `MarkdownView` inside the quick preview popup, instead of a hand-rolled
 * read-only render. The Edit/Reading toggle and the "..." more-options menu are then genuinely
 * Obsidian's own — not something to reimplement — because the popup hosts a real `WorkspaceLeaf`.
 *
 * Obsidian does not publicly expose a way to construct a `WorkspaceLeaf` detached from the visible
 * layout, or the `containerEl` that carries its header (mode toggle, "..." menu) and content. Both
 * exist at runtime but are absent from `obsidian.d.ts`. This is the same technique the community
 * Hover Editor plugin uses to show a live, editable note in a popover. It is isolated to this one
 * file, with a `null` return (never a throw) whenever the expected shape isn't there, so a future
 * Obsidian internal change degrades to the read-only fallback in `QuickPreviewModal` instead of
 * breaking the popup outright.
 *
 * A leaf with no `parent` fails `WorkspaceItem.getRoot()`/`getContainer()` (they walk `.parent`
 * looking for the owning `WorkspaceContainer`), which several core features rely on to resolve the
 * window/document to render into — notably Page Preview's Ctrl/Cmd-hover popover for internal
 * links inside the embedded editor. Pointing `leaf.parent` at the real `rootSplit` (read-only, we
 * never insert the leaf into its children) satisfies that walk without touching the visible
 * layout. Also undocumented (`parent`'s declared type doesn't include a plain split), also the
 * technique Hover Editor uses for the same reason.
 */

import type { App, TFile, WorkspaceLeaf } from "obsidian";
import { WorkspaceLeaf as WorkspaceLeafClass } from "obsidian";

export interface DetachedLeaf {
	leaf: WorkspaceLeaf;
	el: HTMLElement;
}

type UndocumentedLeafCtor = new (app: App) => WorkspaceLeaf;
type UndocumentedLeaf = WorkspaceLeaf & { containerEl?: unknown; parent?: unknown };

/** Opens `file` in a `WorkspaceLeaf` that is never attached to the visible layout. */
export async function openDetachedMarkdownLeaf(
	app: App,
	file: TFile,
): Promise<DetachedLeaf | null> {
	try {
		const LeafCtor = WorkspaceLeafClass as unknown as UndocumentedLeafCtor;
		const leaf = new LeafCtor(app);
		(leaf as UndocumentedLeaf).parent = app.workspace.rootSplit;
		await leaf.openFile(file, { active: true });

		const el = (leaf as UndocumentedLeaf).containerEl;
		if (!(el instanceof HTMLElement)) {
			closeDetachedLeaf({ leaf, el: document.createElement("div") });
			return null;
		}

		return { leaf, el };
	} catch {
		return null;
	}
}

/** Tears down a leaf created by `openDetachedMarkdownLeaf`. Safe to call more than once. */
export function closeDetachedLeaf(handle: DetachedLeaf): void {
	try {
		handle.leaf.detach();
	} catch {
		// The leaf was never attached to a real parent split; detach() may not expect that.
		// Nothing more to clean up on our side if it throws.
	}
}
