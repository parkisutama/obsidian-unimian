// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Resolves a card cover property's raw value to a displayable image source.
 *
 * Extracted from BasesSwimlaneView.ts's `resolveImagePath` (T037); shared because Swimlane is
 * the only current consumer, not because a second consumer exists yet.
 */

import { type App, TFile } from "obsidian";

const EXTERNAL_COVER_PREFIX = /^(https?:\/\/|app:\/\/)/;
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];

/**
 * Resolves a raw cover value (a wikilink, a bare vault path with or without extension, an
 * already-relative/absolute path, or an external/`app://` URL) to a displayable `<img src>`.
 * Falls back to a vault-wide basename/filename search before giving up, so a cover property
 * written as a short wikilink still resolves. Returns `null` (never throws) when nothing
 * matches — the caller decides whether to omit the cover slot in that case.
 */
export function resolveCoverImageSrc(app: App, rawValue: string): string | null {
	if (EXTERNAL_COVER_PREFIX.test(rawValue)) return rawValue;

	const cleanPath = rawValue.replace(/\[\[/g, "").replace(/\]\]/g, "").replace(/\|.*$/, "").trim();
	if (!cleanPath) return null;

	const normalizedPath = cleanPath.replace(/^(\.\.\/)+|^\.\//, "");
	const filename = normalizedPath.split("/").pop() || normalizedPath;

	const direct = app.vault.getAbstractFileByPath(normalizedPath);
	if (direct instanceof TFile) return app.vault.getResourcePath(direct);

	if (!/\.\w+$/.test(normalizedPath)) {
		for (const extension of IMAGE_EXTENSIONS) {
			const withExtension = app.vault.getAbstractFileByPath(normalizedPath + extension);
			if (withExtension instanceof TFile) return app.vault.getResourcePath(withExtension);
		}
	}

	const basenameWithoutExtension = filename.replace(/\.\w+$/, "");
	const match = app.vault
		.getFiles()
		.find(
			(file) =>
				file.path === normalizedPath ||
				file.path.endsWith(`/${normalizedPath}`) ||
				file.basename === basenameWithoutExtension ||
				file.name === filename,
		);
	return match ? app.vault.getResourcePath(match) : null;
}
