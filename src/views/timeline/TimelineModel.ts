// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { EntrySnapshot } from "../../core/entries/EntrySnapshot";
import type { NormalizedValue } from "../../core/entries/NormalizedValue";
import { valueText } from "../../core/entries/valueText";
import { type NormalizedDateRange, normalizeDateRange } from "../../core/temporal/DateRange";
import { type DateOnlyValue, parseTemporalValue } from "../../core/temporal/TemporalValue";
import type { TimelineOptions } from "./timelineOptions";

export type TimelineUnscheduledReason =
	| "start-not-configured"
	| "start-missing"
	| "start-invalid"
	| "end-invalid";

export interface TimelineItem {
	path: string;
	title: string;
	group: string | null;
	colorValue: string | null;
	range: NormalizedDateRange | null;
	unscheduledReason: TimelineUnscheduledReason | null;
}

export interface TimelineGroup {
	key: string;
	label: string | null;
	items: TimelineItem[];
}

export interface TimelineModel {
	startConfigured: boolean;
	groups: TimelineGroup[];
	unscheduled: TimelineItem[];
	itemsByPath: ReadonlyMap<string, TimelineItem>;
}

export interface TimelineEntryGroup {
	key: NormalizedValue;
	entries: readonly EntrySnapshot[];
}

export type TimelineVirtualRow =
	| { path: string; kind: "group"; groupKey: string; label: string; count: number }
	| { path: string; kind: "item"; groupKey: string; item: TimelineItem };

const GROUP_ROW_PREFIX = "unimian-timeline-group:";
const UNGROUPED_KEY = "__timeline-all-items__";

/** Produces the single row identity/order consumed by both sidebar and timeline surfaces. */
export function flattenTimelineRows(
	model: TimelineModel,
	collapsedGroups: ReadonlySet<string> = new Set(),
): TimelineVirtualRow[] {
	const rows: TimelineVirtualRow[] = [];
	for (const group of model.groups) {
		if (group.label !== null) {
			rows.push({
				path: `${GROUP_ROW_PREFIX}${encodeURIComponent(group.key)}`,
				kind: "group",
				groupKey: group.key,
				label: group.label,
				count: group.items.length,
			});
		}
		if (!collapsedGroups.has(group.key)) {
			rows.push(
				...group.items.map((item) => ({
					path: item.path,
					kind: "item" as const,
					groupKey: group.key,
					item,
				})),
			);
		}
	}
	return rows;
}

function mapRange(
	entry: EntrySnapshot,
	options: TimelineOptions,
	today?: DateOnlyValue,
): Pick<TimelineItem, "range" | "unscheduledReason"> {
	if (!options.startProperty) return { range: null, unscheduledReason: "start-not-configured" };
	const startText = valueText(entry.values.get(options.startProperty));
	if (!startText) return { range: null, unscheduledReason: "start-missing" };
	const start = parseTemporalValue(startText);
	if (!start || start.kind === "ongoing")
		return { range: null, unscheduledReason: "start-invalid" };

	let end = null;
	if (options.endProperty) {
		const endText = valueText(entry.values.get(options.endProperty));
		if (endText) {
			end = parseTemporalValue(endText);
			if (!end) return { range: null, unscheduledReason: "end-invalid" };
		}
	}
	return { range: normalizeDateRange(start, end, today ? { today } : {}), unscheduledReason: null };
}

export function buildTimelineModel(
	entryGroups: readonly TimelineEntryGroup[],
	options: TimelineOptions,
	today?: DateOnlyValue,
): TimelineModel {
	if (!options.startProperty) {
		return { startConfigured: false, groups: [], unscheduled: [], itemsByPath: new Map() };
	}
	const groups: TimelineGroup[] = [];
	const unscheduled: TimelineItem[] = [];
	const itemsByPath = new Map<string, TimelineItem>();
	const hasNativeGrouping = entryGroups.some((group) => valueText(group.key) !== null);
	for (const entryGroup of entryGroups) {
		const keyText = valueText(entryGroup.key);
		const groupLabel = hasNativeGrouping ? (keyText ?? "—") : null;
		const groupKey = groupLabel === null ? UNGROUPED_KEY : `${entryGroup.key.kind}:${groupLabel}`;
		const items: TimelineItem[] = [];
		for (const entry of entryGroup.entries) {
			const mappedRange = mapRange(entry, options, today);
			const item: TimelineItem = {
				path: entry.path,
				title:
					(options.titleProperty && valueText(entry.values.get(options.titleProperty))) ||
					entry.basename,
				group: groupLabel,
				colorValue: options.colorProperty
					? valueText(entry.values.get(options.colorProperty))
					: null,
				...mappedRange,
			};
			itemsByPath.set(item.path, item);
			if (!item.range) unscheduled.push(item);
			items.push(item);
		}
		groups.push({ key: groupKey, label: groupLabel, items });
	}
	return {
		startConfigured: true,
		groups,
		unscheduled,
		itemsByPath,
	};
}
