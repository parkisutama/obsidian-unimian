// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { ISO_WEEK, type PeriodicKind, type WeekRule } from "./resolver";

/** Fixed order; also the order the options appear in Bases. */
export const PERIODIC_KINDS: readonly PeriodicKind[] = ["day", "week", "month", "quarter", "year"];

export type WeekNumbering = "iso" | "locale";

const CAPITALIZED: Record<PeriodicKind, string> = {
	day: "Day",
	week: "Week",
	month: "Month",
	quarter: "Quarter",
	year: "Year",
};

/** Persisted `.base` option keys. Prefixed so none can collide with a Bases-reserved key. */
export const periodicKeys = (kind: PeriodicKind): { path: string; template: string } => ({
	path: `periodic${CAPITALIZED[kind]}Path`,
	template: `periodic${CAPITALIZED[kind]}Template`,
});

export const WEEK_NUMBERING_KEY = "periodicWeekNumbering";

export interface PeriodicPeriodConfig {
	/** Vault-relative pattern; empty means this period is not configured (no links, no notes). */
	pattern: string;
	/** Template note path; empty means create the note without a template. */
	template: string;
}

export interface PeriodicConfig {
	periods: Record<PeriodicKind, PeriodicPeriodConfig>;
	weekRule: WeekRule;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Reads the periodic-notes options from a view config. `weekStartsOn` (0 = Sunday .. 6) is the
 * view's own first weekday, used only when week numbering is `locale`.
 */
export function readPeriodicConfig(
	get: (key: string) => unknown,
	weekStartsOn: number,
): PeriodicConfig {
	const periods = {} as Record<PeriodicKind, PeriodicPeriodConfig>;
	for (const kind of PERIODIC_KINDS) {
		const keys = periodicKeys(kind);
		periods[kind] = { pattern: text(get(keys.path)), template: text(get(keys.template)) };
	}
	const numbering = get(WEEK_NUMBERING_KEY) === "locale" ? "locale" : "iso";
	const weekRule: WeekRule =
		numbering === "locale" ? { firstDay: weekStartsOn, minDays: 1 } : ISO_WEEK;
	return { periods, weekRule };
}

/** The periods that have a pattern, i.e. that Calendar should link and create notes for. */
export function configuredKinds(config: PeriodicConfig): PeriodicKind[] {
	return PERIODIC_KINDS.filter((kind) => config.periods[kind].pattern !== "");
}
