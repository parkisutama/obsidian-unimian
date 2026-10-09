// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

/**
 * One-time import of option values saved by earlier versions of this view.
 *
 * The former view id `unimian-gantt` was first released for the Frappe-based Gantt. The current
 * Unimian id is `unimian-gantt`, so a base saved by that release opens in this view with the old
 * option keys (`startDate`, `viewMode`, ...). During
 * development this view also stored its options under a `ganttBeta*` prefix. Both are copied to the
 * permanent `gantt*` keys once, so the option panel shows what the chart is using and nothing is
 * silently guessed at read time. The old keys are left in the file untouched.
 */

/** Every option key this view stores. `tests/gantt-legacy-options.test.ts` checks it against the schema. */
export const GANTT_OPTION_KEYS = [
	"ganttStart",
	"ganttEnd",
	"ganttLabel",
	"ganttParent",
	"ganttOrder",
	"ganttProgress",
	"ganttColorBy",
	"ganttDependencyFS",
	"ganttScale",
	"ganttShowNonWorkingDays",
	"ganttWorkingWeekdays",
	"ganttHolidays",
	"ganttSnapToWorkingDays",
	"ganttFirstDayOfWeek",
	"ganttZoomOnWheel",
	"ganttInfiniteScroll",
	"ganttScrollToToday",
	"ganttPhases",
	"ganttShowTaskList",
	"ganttShowRowNumbers",
	"ganttShowDetail",
	"ganttShowProgress",
	"ganttShowTooltip",
	"ganttRowHeight",
	"ganttReadOnly",
	"ganttAllowMove",
	"ganttAllowResize",
	"ganttAllowProgress",
	"ganttAllowLinkCreate",
	"ganttAllowLinkDelete",
	"ganttAllowReorder",
	"ganttAllowTaskCreate",
	"ganttDependencyShift",
	"ganttWritePhaseDates",
	"ganttTemplatePath",
	"ganttTargetFolder",
	"ganttTitleFormat",
	"ganttCollapsedIds",
] as const;

/** Written once something was imported, so a value the user clears later is never brought back. */
export const LEGACY_IMPORT_MARKER = "ganttLegacyImported";

export interface LegacyOptionConfig {
	get(key: string): unknown;
	set?(key: string, value: unknown): void;
}

interface LegacySource {
	from: string;
	convert?: (value: unknown) => unknown;
}

const BETA_PREFIX = "ganttBeta";

/** The Frappe view stored a display-cased view mode; sub-day modes have no equivalent scale. */
const FRAPPE_SCALES: Record<string, string> = {
	Day: "day",
	Week: "week",
	Month: "month",
	Year: "year",
};

/** The Frappe view's option keys as released in 1.0.2 and 1.0.3. */
const FRAPPE_SOURCES: Record<string, LegacySource[]> = {
	ganttStart: [{ from: "startDate" }],
	ganttEnd: [{ from: "endDate" }],
	ganttLabel: [{ from: "label" }],
	ganttDependencyFS: [{ from: "dependencies" }],
	ganttColorBy: [{ from: "colorBy" }],
	ganttProgress: [{ from: "progress" }],
	ganttParent: [{ from: "parentProp" }],
	ganttScale: [
		{
			from: "viewMode",
			convert: (value) => (typeof value === "string" ? (FRAPPE_SCALES[value] ?? "day") : undefined),
		},
	],
	ganttShowTaskList: [{ from: "showWbsSidebar" }],
	ganttShowProgress: [{ from: "showProgress" }],
	ganttTemplatePath: [{ from: "templatePath" }],
	ganttTargetFolder: [{ from: "targetFolder" }],
	ganttTitleFormat: [{ from: "titleFormat" }],
	ganttDependencyShift: [
		{
			from: "persistDependencyDateChanges",
			convert: (value) => (value === true ? "maintain-gap" : undefined),
		},
	],
};

/** Names this view used before the `ganttBeta` prefix was dropped, beyond the plain prefix swap. */
const BETA_EXTRA_SOURCES: Record<string, LegacySource[]> = {
	ganttDependencyFS: [{ from: "ganttBetaDependsOn" }],
	ganttDependencyShift: [
		{
			from: "ganttBetaMoveDependencies",
			convert: (value) => (value === true ? "maintain-gap" : undefined),
		},
	],
};

const isSet = (value: unknown): boolean => value !== undefined && value !== null;

/** Older names for `key`, newest first: the `ganttBeta*` twin, then the Frappe key. */
function sourcesFor(key: string): LegacySource[] {
	return [
		{ from: `${BETA_PREFIX}${key.slice("gantt".length)}` },
		...(BETA_EXTRA_SOURCES[key] ?? []),
		...(FRAPPE_SOURCES[key] ?? []),
	];
}

/**
 * Copies values saved under an older name to the permanent key when the permanent key was never set.
 * Returns the keys that were imported. Does nothing when the config cannot be written or an import
 * already happened for this view.
 */
export function migrateLegacyOptions(config: LegacyOptionConfig): string[] {
	if (typeof config.set !== "function") return [];
	if (config.get(LEGACY_IMPORT_MARKER) === true) return [];

	const imported: string[] = [];
	for (const key of GANTT_OPTION_KEYS) {
		if (isSet(config.get(key))) continue;
		for (const source of sourcesFor(key)) {
			const raw = config.get(source.from);
			if (!isSet(raw)) continue;
			const value = source.convert ? source.convert(raw) : raw;
			if (value === undefined) continue;
			config.set(key, value);
			imported.push(key);
			break;
		}
	}
	if (imported.length > 0) config.set(LEGACY_IMPORT_MARKER, true);
	return imported;
}
