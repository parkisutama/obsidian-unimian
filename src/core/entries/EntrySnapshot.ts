// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Immutable entry snapshot contract (T017, spec §7.5).
 *
 * Obsidian recreates `BasesQueryResult`/`BasesEntry` objects on every data update; nothing may
 * retain one across an update cycle (spec §7.10, architecture guard T005). `EntrySnapshot` is
 * the shared boundary every view consumes instead: identity/metadata plus only the property
 * values a view contract actually requested, already normalized. It imports nothing from
 * `obsidian`; building one from a live `BasesEntry` is a `platform`-layer concern (T018).
 */

import type { NormalizedValue } from "./NormalizedValue";

export interface EntrySnapshot {
	/** Vault path; the durable identity for caches, virtual rows, and diffing (spec §11 "Always"). */
	path: string;
	basename: string;
	extension: string;
	folder: string;
	ctime: number;
	mtime: number;
	/** Keyed by the requested Bases property id (e.g. `note.status`, `file.path`, `formula.x`). */
	values: ReadonlyMap<string, NormalizedValue>;
}

/** Read a snapshot's normalized value for a property, or `undefined` if it was never requested. */
export function getValue(snapshot: EntrySnapshot, propertyId: string): NormalizedValue | undefined {
	return snapshot.values.get(propertyId);
}
