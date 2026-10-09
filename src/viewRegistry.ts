// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * ViewDescriptor registry (T006).
 *
 * The single source of truth for a Bases view's stable ID, display metadata, factory, view
 * options, hover-preview attribution, optional commands, and capability declaration (spec
 * §7.3). Building descriptor objects and validating them never instantiates a view: `factory`
 * is stored, not called, until Obsidian itself mounts the view.
 */

import type {
	App,
	BasesAllOptions,
	BasesViewConfig,
	BasesViewFactory,
	Command,
	HoverLinkSource,
} from "obsidian";
import {
	createGrantedMutations,
	type GrantedMutations,
	type MutationGrant,
} from "./platform/mutations/grants";

/** Every Unimian type ID must use this prefix; enforced by validateViewDescriptor. */
export const VIEW_ID_PREFIX = "unimian-";

/**
 * Capabilities a descriptor may declare. `legacyMutation` marks a view that keeps existing
 * direct vault/frontmatter write behavior during the refactor (spec §7.10); it must not be set
 * on a new view without a separately approved decision.
 */
export interface ViewCapabilities {
	legacyMutation?: boolean;
	/**
	 * Scoped write grants for a view approved in docs/architecture/view-write-access.md. Unlike
	 * `legacyMutation`, the view receives only these capabilities, via `ViewRegistry.mutationsFor`.
	 */
	mutations?: readonly MutationGrant[];
}

/**
 * View ids approved to declare `capabilities.mutations`. Each entry must have a matching section
 * in docs/architecture/view-write-access.md; adding one is a compatibility decision, not a refactor.
 */
export const APPROVED_MUTATION_GRANT_VIEW_IDS: readonly string[] = ["unimian-gantt"];

/**
 * Everything needed to register one Bases view with Obsidian: the view registration itself,
 * hover-preview attribution, optional command-palette commands, and its capability
 * declaration. Expressive enough for Calendar, Gantt, and Swimlane without per-view branching
 * in the registry or in `main.ts`.
 */
export interface ViewDescriptor {
	/** Bases type ID, e.g. `unimian-calendar`. */
	id: string;
	name: string;
	icon: string;
	factory: BasesViewFactory;
	options?: (config: BasesViewConfig) => BasesAllOptions[];
	/** Page Preview attribution for this view's hover-link events. Omitted if the view never hovers. */
	hover?: HoverLinkSource;
	/** Command-palette commands scoped to this view. Empty/omitted if the view exposes none. */
	commands?: Command[];
	capabilities?: ViewCapabilities;
}

export class DuplicateViewIdError extends Error {
	constructor(public readonly id: string) {
		super(`A view with id "${id}" is already registered.`);
	}
}

export class InvalidViewIdError extends Error {
	constructor(public readonly id: string) {
		super(`View id "${id}" must start with "${VIEW_ID_PREFIX}".`);
	}
}

export class UnapprovedMutationGrantError extends Error {
	constructor(public readonly id: string) {
		super(
			`View "${id}" declares scoped mutations but is not listed in APPROVED_MUTATION_GRANT_VIEW_IDS.`,
		);
	}
}

export class ConflictingMutationCapabilitiesError extends Error {
	constructor(public readonly id: string) {
		super(`View "${id}" declares both legacyMutation and scoped mutations; choose one.`);
	}
}

/**
 * Validates id format and write-capability declarations; does not touch `factory` or any other
 * view-instantiating field.
 */
export function validateViewDescriptor(descriptor: ViewDescriptor): void {
	if (!descriptor.id.startsWith(VIEW_ID_PREFIX)) {
		throw new InvalidViewIdError(descriptor.id);
	}
	const capabilities = descriptor.capabilities;
	if (capabilities?.mutations === undefined) return;
	if (capabilities.legacyMutation) {
		throw new ConflictingMutationCapabilitiesError(descriptor.id);
	}
	if (!APPROVED_MUTATION_GRANT_VIEW_IDS.includes(descriptor.id)) {
		throw new UnapprovedMutationGrantError(descriptor.id);
	}
}

/**
 * Ordered collection of view descriptors. `main.ts` iterates `list()` to register Bases views,
 * hover sources, and commands from one place instead of separate per-view lists (spec §7.3).
 */
export class ViewRegistry {
	private readonly byId = new Map<string, ViewDescriptor>();
	private readonly order: string[] = [];

	/** Validates and stores the descriptor. Throws before storing on an invalid or duplicate id. */
	register(descriptor: ViewDescriptor): void {
		validateViewDescriptor(descriptor);
		if (this.byId.has(descriptor.id)) {
			throw new DuplicateViewIdError(descriptor.id);
		}
		this.byId.set(descriptor.id, descriptor);
		this.order.push(descriptor.id);
	}

	/** Descriptors in registration order. */
	list(): ViewDescriptor[] {
		return this.order.map((id) => this.byId.get(id)!);
	}

	get(id: string): ViewDescriptor | undefined {
		return this.byId.get(id);
	}

	has(id: string): boolean {
		return this.byId.has(id);
	}

	/**
	 * The write capabilities a registered view declared in `capabilities.mutations`, and nothing
	 * else. A view without that declaration (or an unknown id) gets an empty object, so it has no
	 * way to write through the registry.
	 */
	mutationsFor(id: string, app: App): GrantedMutations {
		return createGrantedMutations(app, this.byId.get(id)?.capabilities?.mutations ?? []);
	}
}
