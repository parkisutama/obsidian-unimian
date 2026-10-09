// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { TaskDependency } from "@jaeungkim/gantt-chart";
import { type GanttPropertyDateType, writeGanttDate } from "./dates";
import {
	appendGanttDependency,
	type DependencyStorage,
	removeGanttDependency,
	toGanttWikiLink,
} from "./dependencies";
import type { GanttTaskDiff } from "./diff";
import { SYNTHETIC_PHASE_PREFIX } from "./phases";
import { compareSequence } from "./sequence";

export interface GanttMutationPlanItem {
	path: string;
	values: Record<string, unknown>;
}
export interface GanttMutationPlanOptions {
	start?: { id: string; type: GanttPropertyDateType };
	end?: { id: string; type: GanttPropertyDateType };
	progress?: string;
	parent?: string;
	order?: string;
	dependsOn?: string;
	/** Shape a new Depends on value takes when the note has none yet (see appendGanttDependency). */
	dependsStorage?: DependencyStorage;
	currentOrder?: ReadonlyMap<string, number | null | undefined>;
	currentDependsOn?: ReadonlyMap<string, unknown>;
	resolveLink?: (target: string) => string | null;
	/** Link text to store for a note, as Obsidian would write it from `sourcePath` (vault link settings). */
	formatLink?: (targetPath: string, sourcePath: string) => string;
	dateTypes?: ReadonlyMap<string, { start: GanttPropertyDateType; end: GanttPropertyDateType }>;
	phaseIds?: ReadonlySet<string>;
	writePhaseDates?: boolean;
}

function dependencyTargets(values: readonly TaskDependency[] | undefined): Set<string> {
	return new Set(
		(values ?? []).filter((value) => value.type === "FS").map((value) => value.targetId),
	);
}

function sequenceCompare(left: GanttTaskDiff, right: GanttTaskDiff): number {
	return compareSequence(left.after.sequence, right.after.sequence);
}

/** Translates pure chart diffs into changed frontmatter fields, without performing any I/O. */
export function buildGanttMutationPlan(
	changes: readonly GanttTaskDiff[],
	options: GanttMutationPlanOptions,
): GanttMutationPlanItem[] {
	const valuesByPath = new Map<string, Record<string, unknown>>();
	const valuesFor = (path: string) => {
		const values = valuesByPath.get(path) ?? {};
		valuesByPath.set(path, values);
		return values;
	};

	for (const change of changes) {
		if (change.id.startsWith(SYNTHETIC_PHASE_PREFIX)) continue;
		const values = valuesFor(change.id);
		const datesWritable = options.writePhaseDates || !options.phaseIds?.has(change.id);
		const ownTypes = options.dateTypes?.get(change.id);
		if (
			datesWritable &&
			change.datesChanged &&
			options.start &&
			change.before.startDate !== change.after.startDate
		) {
			const next = writeGanttDate(
				change.after.startDate,
				ownTypes?.start ?? options.start.type,
				"start",
			);
			if (next !== null) values[options.start.id] = next;
		}
		if (
			datesWritable &&
			change.datesChanged &&
			options.end &&
			change.before.endDate !== change.after.endDate
		) {
			const next = writeGanttDate(change.after.endDate, ownTypes?.end ?? options.end.type, "end");
			if (next !== null) values[options.end.id] = next;
		}
		if (change.progressChanged && options.progress)
			values[options.progress] = change.after.progress ?? null;
		if (change.parentChanged && options.parent) {
			if (change.after.parentId === null) values[options.parent] = null;
			else if (!change.after.parentId.startsWith(SYNTHETIC_PHASE_PREFIX)) {
				values[options.parent] = (options.formatLink ?? toGanttWikiLink)(
					change.after.parentId,
					change.id,
				);
			}
		}
		if (change.dependenciesChanged && options.dependsOn) {
			const resolve =
				options.resolveLink ?? ((target) => (target.endsWith(".md") ? target : `${target}.md`));
			const before = dependencyTargets(change.before.dependencies);
			const after = dependencyTargets(change.after.dependencies);
			let stored = options.currentDependsOn?.get(change.id);
			for (const target of before)
				if (!after.has(target)) stored = removeGanttDependency(stored, target, resolve);
			for (const target of after)
				if (!before.has(target))
					stored = appendGanttDependency(
						stored,
						target,
						resolve,
						options.dependsStorage,
						(targetPath) => (options.formatLink ?? toGanttWikiLink)(targetPath, change.id),
					);
			values[options.dependsOn] = stored;
		}
	}

	if (options.order) {
		const affected = changes.filter((change) => change.orderGroupAffected);
		const parents = new Set(affected.map((change) => change.after.parentId));
		for (const parent of parents) {
			const siblings = affected
				.filter((change) => change.after.parentId === parent)
				.sort(sequenceCompare);
			for (const [index, sibling] of siblings.entries()) {
				const desired = (index + 1) * 10;
				if (options.currentOrder?.get(sibling.id) !== desired)
					valuesFor(sibling.id)[options.order] = desired;
			}
		}
	}

	return [...valuesByPath]
		.filter(([, values]) => Object.keys(values).length > 0)
		.map(([path, values]) => ({ path, values }))
		.sort((left, right) => left.path.localeCompare(right.path));
}
