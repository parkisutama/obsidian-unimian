// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * Validated view configuration access (T019, spec §7.7).
 *
 * Centralizes typed reads of a Bases view's `BasesViewConfig` in one place: coercion, defaults,
 * property-id resolution. An invalid or missing value always resolves to the caller-supplied
 * default rather than throwing or silently propagating `undefined`/`NaN`. This reader has no
 * built-in default of its own — every default comes from the caller, so nothing here can
 * introduce a task-specific property name (spec §7.7 "defaults do not silently enforce status,
 * priority, or task schemas").
 */

import type { BasesPropertyId, BasesViewConfig } from "obsidian";

export class ViewConfigReader {
	constructor(private readonly config: BasesViewConfig) {}

	getString(key: string, fallback: string): string {
		const value = this.config.get(key);
		return typeof value === "string" && value.length > 0 ? value : fallback;
	}

	/** Like `getString`, but an empty string is a valid result (not replaced by the fallback). */
	getOptionalString(key: string): string | null {
		const value = this.config.get(key);
		return typeof value === "string" ? value : null;
	}

	getNumber(key: string, fallback: number): number {
		const value = this.config.get(key);
		return typeof value === "number" && Number.isFinite(value) ? value : fallback;
	}

	getBoolean(key: string, fallback: boolean): boolean {
		const value = this.config.get(key);
		return typeof value === "boolean" ? value : fallback;
	}

	/** Resolves to `fallback` unless the stored value is exactly one of `values`. */
	getEnum<T extends string>(key: string, values: readonly T[], fallback: T): T {
		const value = this.config.get(key);
		return typeof value === "string" && (values as readonly string[]).includes(value)
			? (value as T)
			: fallback;
	}

	/** `null` when unset or invalid — Bases' own `getAsPropertyId` already never guesses. */
	getPropertyId(key: string): BasesPropertyId | null {
		return this.config.getAsPropertyId(key);
	}

	getOrder(): BasesPropertyId[] {
		return this.config.getOrder();
	}

	getDisplayName(propertyId: BasesPropertyId): string {
		return this.config.getDisplayName(propertyId);
	}
}
