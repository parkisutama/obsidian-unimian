// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

// Fixture: a new-view module that violates the read-only boundary in every way the guard
// checks for. Used by tests/architecture.test.ts to prove each forbidden pattern is caught;
// this file is never imported by production code or by src/**.

export async function mutateFromNewView(
	app: {
		fileManager: {
			processFrontMatter(file: unknown, fn: (fm: Record<string, unknown>) => void): Promise<void>;
		};
		vault: {
			modify(file: unknown, data: string): Promise<void>;
			trashFile(file: unknown): Promise<void>;
		};
	},
	file: unknown,
	editor: { setValue(value: string): void },
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm) => {
		fm.done = true;
	});
	await app.vault.modify(file, "changed");
	await app.vault.trashFile(file);
	editor.setValue("changed");
}
