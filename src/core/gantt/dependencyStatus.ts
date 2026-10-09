// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { Task } from "@jaeungkim/gantt-chart";

/**
 * What the dependency graph says about one task. Everything here is derived from Depends on, so
 * "blocks" is never stored: it is the same relation read from the other side.
 */
export interface DependencyStatus {
	/** Tasks that depend on this one (this task blocks them). */
	blocks: string[];
	/** Tasks this one depends on (finish-to-start predecessors that exist in the chart). */
	dependsOn: string[];
	/** Predecessors that have not reached 100% progress. Empty when completion is not tracked. */
	incomplete: string[];
	/** Predecessors that finish after this task starts, so the dates contradict the dependency. */
	conflicts: string[];
}

export interface DependencyStatusOptions {
	/** Only meaningful with a Progress property: without one, "complete" cannot be known. */
	trackCompletion: boolean;
}

export const BLOCKED_CLASS = "unimian-gantt-blocked";
export const CONFLICT_CLASS = "unimian-gantt-conflict";

function chartTime(value: string): number {
	return Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
}

const EMPTY: DependencyStatus = { blocks: [], dependsOn: [], incomplete: [], conflicts: [] };

/** Finish-to-start only, matching what Gantt stores. Unknown or self predecessors are ignored. */
export function computeDependencyStatus(
	tasks: readonly Task[],
	options: DependencyStatusOptions,
): Map<string, DependencyStatus> {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	const status = new Map<string, DependencyStatus>();
	const of = (id: string): DependencyStatus => {
		let entry = status.get(id);
		if (!entry) {
			entry = { blocks: [], dependsOn: [], incomplete: [], conflicts: [] };
			status.set(id, entry);
		}
		return entry;
	};

	for (const task of tasks) {
		for (const dependency of task.dependencies ?? []) {
			if (dependency.type !== "FS" || dependency.targetId === task.id) continue;
			const predecessor = byId.get(dependency.targetId);
			if (!predecessor) continue;
			const mine = of(task.id);
			if (mine.dependsOn.includes(predecessor.id)) continue;
			mine.dependsOn.push(predecessor.id);
			of(predecessor.id).blocks.push(task.id);
			if (options.trackCompletion && (predecessor.progress ?? 0) < 100)
				mine.incomplete.push(predecessor.id);
			// Ends are exclusive, so a predecessor ending exactly when this task starts is fine.
			if (chartTime(predecessor.endDate) > chartTime(task.startDate))
				mine.conflicts.push(predecessor.id);
		}
	}
	return status;
}

export function dependencyStatusOf(
	status: ReadonlyMap<string, DependencyStatus>,
	id: string,
): DependencyStatus {
	return status.get(id) ?? EMPTY;
}

/**
 * Tags tasks so the chart can style the bar and its list row. Untouched tasks keep their identity,
 * so a status that did not change does not look like a data change to the chart.
 */
export function annotateDependencyStatus(
	tasks: Task[],
	status: ReadonlyMap<string, DependencyStatus>,
): Task[] {
	return tasks.map((task) => {
		const entry = status.get(task.id);
		const tokens = (task.className ?? "")
			.split(/\s+/)
			.filter((token) => token && token !== BLOCKED_CLASS && token !== CONFLICT_CLASS);
		if (entry && entry.incomplete.length > 0) tokens.push(BLOCKED_CLASS);
		if (entry && entry.conflicts.length > 0) tokens.push(CONFLICT_CLASS);
		const className = tokens.join(" ");
		if ((task.className ?? "") === className) return task;
		const { className: _previous, ...rest } = task;
		return className ? { ...rest, className } : rest;
	});
}
