// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

// Fixture: a permitted new-view adapter. It reads entry snapshots and navigates, but never
// mutates the vault, frontmatter, or an editor. Used by tests/architecture.test.ts to prove the
// mutation guard does not flag read-only new-view code.

export interface AllowedCardItem {
	path: string;
	title: string;
}

export function renderCard(
	app: { workspace: { openLinkText(path: string): Promise<void> } },
	item: AllowedCardItem,
): void {
	void app.workspace.openLinkText(item.path);
}
