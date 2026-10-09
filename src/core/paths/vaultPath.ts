// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Vault path safety. Pure: no Obsidian imports.
 *
 * Folder and file paths are built from user data (view options, settings, property values, path
 * patterns). `normalizePath` tidies slashes but keeps `..` segments, so a value such as
 * `../../Outside` would address a location outside the vault. Every path that reaches a vault
 * write goes through `assertInsideVault` first.
 */

/** True when a path contains a `..` segment, with either slash style. */
export function escapesVault(path: string): boolean {
	return path.split(/[\\/]/).includes("..");
}

/** Returns `path` unchanged, or throws when it would leave the vault. */
export function assertInsideVault(path: string): string {
	if (escapesVault(path)) throw new Error(`Path leaves the vault: "${path}"`);
	return path;
}
