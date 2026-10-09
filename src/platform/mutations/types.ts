// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Legacy mutation capability contracts (T023, spec §7.10).
 *
 * Existing Calendar/Gantt/Swimlane write behavior moves behind these small interfaces so it
 * can be granted only to the views that already have it (T024-T026) — never to a new view
 * (architecture guard, T005). Every method takes a vault path and plain values; none accepts
 * or returns a `BasesEntry`, `Value`, or any object Obsidian recreates after an update.
 */

export type MutationFailureReason = "file-not-found" | "formula-property" | "error";

export type MutationResult =
	| { ok: true }
	| { ok: false; reason: MutationFailureReason; message: string };
export type MoveMutationResult =
	| { ok: true; path: string }
	| { ok: false; reason: MutationFailureReason; message: string };

/** Writes a start/end date pair, e.g. from a calendar drag or a Gantt bar move/resize. */
export interface DateMutationCapability {
	updateRange(
		path: string,
		startPropertyId: string,
		start: string,
		endPropertyId?: string | null,
		end?: string | null,
	): Promise<MutationResult>;
}

/** Writes one arbitrary property, e.g. moving a Swimlane card to a different column. */
export interface PropertyMutationCapability {
	setProperty(path: string, propertyId: string, value: unknown): Promise<MutationResult>;
	setProperties(path: string, values: Readonly<Record<string, unknown>>): Promise<MutationResult>;
}

/** Moves a note to a folder while preserving its name and avoiding path conflicts. */
export interface MoveMutationCapability {
	moveToFolder(path: string, targetFolder: string): Promise<MoveMutationResult>;
}

/** Writes a dependency list, e.g. after a Gantt drag re-links a dependent task's dates. */
export interface DependencyMutationCapability {
	setDependencies(path: string, propertyId: string, dependencies: unknown): Promise<MutationResult>;
}

export interface NoteCreationRequest {
	path: string;
	frontmatter?: Readonly<Record<string, unknown>>;
	body?: string;
	/**
	 * Vault path of a template to create the note through Templater or the core Templates plugin.
	 * When set, `body` is ignored and `frontmatter` is merged over what the template wrote.
	 */
	templatePath?: string;
}

/** Creates a new note, e.g. "new note at today" from the Calendar/Gantt command palette. */
export interface FileCreateCapability {
	createNote(request: NoteCreationRequest): Promise<MutationResult>;
}

/** Moves a note to the trash, e.g. deleting an event from the Calendar context menu. */
export interface TrashCapability {
	trash(path: string): Promise<MutationResult>;
}
