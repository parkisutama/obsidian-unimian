// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { Task, TaskDependency } from "@jaeungkim/gantt-chart";
import { SYNTHETIC_PHASE_PREFIX } from "./phases";

export interface GanttTaskDiff {
	id: string;
	before: Task;
	after: Task;
	datesChanged: boolean;
	progressChanged: boolean;
	parentChanged: boolean;
	sequenceChanged: boolean;
	dependenciesChanged: boolean;
	orderGroupAffected: boolean;
}

function dependencyKeys(values: readonly TaskDependency[] | undefined): string[] {
	return (values ?? []).map((value) => `${value.type}\0${value.targetId}`).sort();
}

function sameDependencies(
	left: readonly TaskDependency[] | undefined,
	right: readonly TaskDependency[] | undefined,
): boolean {
	const a = dependencyKeys(left);
	const b = dependencyKeys(right);
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Diffs only persisted, existing note tasks. Added/removed and synthetic chart rows are callbacks handled elsewhere. */
export function diffGanttTasks(
	beforeTasks: readonly Task[],
	afterTasks: readonly Task[],
): GanttTaskDiff[] {
	const beforeById = new Map(beforeTasks.map((task) => [task.id, task]));
	const afterById = new Map(afterTasks.map((task) => [task.id, task]));
	const direct = new Map<string, GanttTaskDiff>();
	const affectedParents = new Set<string | null>();

	for (const after of afterTasks) {
		if (after.id.startsWith(SYNTHETIC_PHASE_PREFIX)) continue;
		const before = beforeById.get(after.id);
		if (!before) continue;
		const datesChanged = before.startDate !== after.startDate || before.endDate !== after.endDate;
		const progressChanged = before.progress !== after.progress;
		const parentChanged = before.parentId !== after.parentId;
		const sequenceChanged = before.sequence !== after.sequence;
		const dependenciesChanged = !sameDependencies(before.dependencies, after.dependencies);
		if (
			!(datesChanged || progressChanged || parentChanged || sequenceChanged || dependenciesChanged)
		)
			continue;
		if (parentChanged || sequenceChanged) {
			affectedParents.add(before.parentId);
			affectedParents.add(after.parentId);
		}
		direct.set(after.id, {
			id: after.id,
			before,
			after,
			datesChanged,
			progressChanged,
			parentChanged,
			sequenceChanged,
			dependenciesChanged,
			orderGroupAffected: parentChanged || sequenceChanged,
		});
	}

	if (affectedParents.size > 0) {
		for (const after of afterTasks) {
			if (after.id.startsWith(SYNTHETIC_PHASE_PREFIX) || !affectedParents.has(after.parentId))
				continue;
			const before = beforeById.get(after.id);
			if (!before || !afterById.has(before.id)) continue;
			const existing = direct.get(after.id);
			if (existing) existing.orderGroupAffected = true;
			else
				direct.set(after.id, {
					id: after.id,
					before,
					after,
					datesChanged: false,
					progressChanged: false,
					parentChanged: false,
					sequenceChanged: false,
					dependenciesChanged: false,
					orderGroupAffected: true,
				});
		}
	}

	return [...direct.values()];
}
