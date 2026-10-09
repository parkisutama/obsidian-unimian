// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Render change detection (T022, spec §7.11).
 *
 * Pure signature computation over primitives only (paths, mtimes, strings) — never a retained
 * `BasesEntry` or query-result object, so a scheduler can decide whether to skip/fast-path/fully
 * re-render without keeping anything Obsidian will recreate on the next update alive.
 *
 * A signature has four independently comparable layers, so a scheduler can tell *which* layer
 * changed instead of only whether *something* changed:
 * - `entries`: path/mtime of every entry, order-sensitive.
 * - `order`: the view's configured property order.
 * - `groups`: group keys, in Bases' order.
 * - `config`: whatever view-option values affect rendering.
 */

export interface EntryIdentity {
	path: string;
	mtime: number;
}

export interface RenderSignatureInput {
	entries: readonly EntryIdentity[];
	order: readonly string[];
	groupKeys: readonly string[];
	/** Only the config values that affect this view's render output — not the whole config object. */
	config: Readonly<Record<string, unknown>>;
}

export interface RenderSignature {
	entries: string;
	order: string;
	groups: string;
	config: string;
}

export function computeRenderSignature(input: RenderSignatureInput): RenderSignature {
	return {
		entries: input.entries.map((e) => `${e.path}:${e.mtime}`).join("|"),
		order: input.order.join("|"),
		groups: input.groupKeys.join("|"),
		config: JSON.stringify(input.config, Object.keys(input.config).sort()),
	};
}

export interface RenderSignatureDiff {
	entriesChanged: boolean;
	orderChanged: boolean;
	groupsChanged: boolean;
	configChanged: boolean;
	identical: boolean;
}

/** Compares two signatures layer by layer. `prev === null` (first render) reports every layer changed. */
export function diffRenderSignatures(
	prev: RenderSignature | null,
	next: RenderSignature,
): RenderSignatureDiff {
	if (!prev) {
		return {
			entriesChanged: true,
			orderChanged: true,
			groupsChanged: true,
			configChanged: true,
			identical: false,
		};
	}
	const entriesChanged = prev.entries !== next.entries;
	const orderChanged = prev.order !== next.order;
	const groupsChanged = prev.groups !== next.groups;
	const configChanged = prev.config !== next.config;
	return {
		entriesChanged,
		orderChanged,
		groupsChanged,
		configChanged,
		identical: !entriesChanged && !orderChanged && !groupsChanged && !configChanged,
	};
}
