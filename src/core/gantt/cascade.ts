// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { Task } from "@jaeungkim/gantt-chart";

export type GanttDependencyPolicy = "none" | "overlap" | "maintain-gap";

function instant(value: string): number {
	const source = /^\d{4}-\d{2}-\d{2}$/.test(value)
		? `${value}T00:00:00Z`
		: /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
			? value
			: `${value}Z`;
	return Date.parse(source);
}

function shifted(value: string, delta: number): string {
	const date = new Date(instant(value) + delta);
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return date.toISOString().slice(0, 10);
	return date.toISOString().slice(0, 16);
}

function fsPredecessors(task: Task): string[] {
	return (task.dependencies ?? [])
		.filter((dependency) => dependency.type === "FS")
		.map((dependency) => dependency.targetId);
}

/**
 * Applies the configured FS schedule policy to the chart's optimistic task array. Directly edited
 * tasks are authoritative; only their reachable, non-direct successors may be shifted.
 */
export function applyGanttDependencyPolicy(
	beforeTasks: readonly Task[],
	afterTasks: Task[],
	policy: GanttDependencyPolicy,
): Task[] {
	if (policy === "none") return afterTasks;
	const before = new Map(beforeTasks.map((task) => [task.id, task]));
	const after = new Map(afterTasks.map((task) => [task.id, task]));
	const direct = new Set(
		afterTasks
			.filter((task) => {
				const previous = before.get(task.id);
				return (
					previous && (previous.startDate !== task.startDate || previous.endDate !== task.endDate)
				);
			})
			.map((task) => task.id),
	);
	if (direct.size === 0) return afterTasks;

	const successors = new Map<string, string[]>();
	for (const task of afterTasks)
		for (const predecessor of fsPredecessors(task)) {
			const list = successors.get(predecessor);
			if (list) list.push(task.id);
			else successors.set(predecessor, [task.id]);
		}
	const reachable = new Set(direct);
	const discover = [...direct];
	for (let index = 0; index < discover.length; index += 1) {
		for (const successor of successors.get(discover[index]!) ?? [])
			if (!reachable.has(successor)) {
				reachable.add(successor);
				discover.push(successor);
			}
	}

	const movement = new Map<string, number>();
	for (const id of direct) {
		const previous = before.get(id);
		const current = after.get(id);
		if (previous && current)
			movement.set(id, instant(current.startDate) - instant(previous.startDate));
	}
	const indegree = new Map<string, number>();
	for (const id of reachable)
		if (!direct.has(id)) {
			const task = after.get(id);
			indegree.set(
				id,
				task
					? fsPredecessors(task).filter(
							(predecessor) => reachable.has(predecessor) && !direct.has(predecessor),
						).length
					: 0,
			);
		}
	const ready = [...indegree]
		.filter(([, degree]) => degree === 0)
		.map(([id]) => id)
		.sort();
	const processed = new Set(direct);

	const process = (id: string) => {
		const task = after.get(id);
		if (!task) return;
		const predecessors = fsPredecessors(task).filter((predecessor) => movement.has(predecessor));
		if (predecessors.length === 0) return;
		let delta: number;
		if (policy === "maintain-gap") {
			delta = Math.max(...predecessors.map((predecessor) => movement.get(predecessor)!));
		} else {
			const latestEnd = Math.max(
				...predecessors.map((predecessor) => {
					const predecessorTask = after.get(predecessor)!;
					return instant(predecessorTask.endDate);
				}),
			);
			delta = Math.max(0, latestEnd - instant(task.startDate));
		}
		movement.set(id, delta);
		if (delta !== 0)
			after.set(id, {
				...task,
				startDate: shifted(task.startDate, delta),
				endDate: shifted(task.endDate, delta),
			});
	};

	while (ready.length > 0) {
		const id = ready.shift()!;
		process(id);
		processed.add(id);
		for (const successor of successors.get(id) ?? []) {
			if (!indegree.has(successor) || processed.has(successor)) continue;
			const degree = indegree.get(successor)! - 1;
			indegree.set(successor, degree);
			if (degree === 0) ready.push(successor);
		}
		ready.sort();
	}
	// Dependency cycles have no topological order. Process every remaining task exactly once in a
	// stable order, using whatever predecessor movement is already known, and never revisit it.
	for (const id of [...reachable].filter((id) => !processed.has(id)).sort()) {
		process(id);
		processed.add(id);
	}

	return afterTasks.map((task) => after.get(task.id) ?? task);
}
