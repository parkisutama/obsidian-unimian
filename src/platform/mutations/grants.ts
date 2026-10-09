// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Scoped mutation grants (GBETA-003, docs/architecture/view-write-access.md).
 *
 * A view approved to write under the decision record receives only the capabilities it was
 * granted, never the whole gateway: each capability is a fresh object whose methods delegate to
 * a private `LegacyMutationGateway`, so a granted `date` capability cannot be cast to reach
 * `trash` or `moveToFolder`. Views obtain grants through `ViewRegistry.mutationsFor`.
 */

import type { App } from "obsidian";
import { LegacyMutationGateway } from "./LegacyMutationGateway";
import type {
	DateMutationCapability,
	DependencyMutationCapability,
	FileCreateCapability,
	PropertyMutationCapability,
} from "./types";

/** The capabilities a scoped grant may include. Trash and move are deliberately not grantable. */
export type MutationGrant = "date" | "property" | "dependency" | "fileCreate";

export interface GrantedMutations {
	readonly date?: DateMutationCapability;
	readonly property?: PropertyMutationCapability;
	readonly dependency?: DependencyMutationCapability;
	readonly fileCreate?: FileCreateCapability;
}

/** Builds only the granted capabilities. An empty grant list yields an empty object and no gateway. */
export function createGrantedMutations(
	app: App,
	grants: readonly MutationGrant[],
): GrantedMutations {
	if (grants.length === 0) return {};
	const gateway = new LegacyMutationGateway(app);
	const granted = new Set(grants);
	const result: {
		date?: DateMutationCapability;
		property?: PropertyMutationCapability;
		dependency?: DependencyMutationCapability;
		fileCreate?: FileCreateCapability;
	} = {};

	if (granted.has("date")) {
		result.date = {
			updateRange: (path, startPropertyId, start, endPropertyId, end) =>
				gateway.updateRange(path, startPropertyId, start, endPropertyId, end),
		};
	}
	if (granted.has("property")) {
		result.property = {
			setProperty: (path, propertyId, value) => gateway.setProperty(path, propertyId, value),
			setProperties: (path, values) => gateway.setProperties(path, values),
		};
	}
	if (granted.has("dependency")) {
		result.dependency = {
			setDependencies: (path, propertyId, dependencies) =>
				gateway.setDependencies(path, propertyId, dependencies),
		};
	}
	if (granted.has("fileCreate")) {
		result.fileCreate = {
			createNote: (request) => gateway.createNote(request),
		};
	}
	return result;
}
