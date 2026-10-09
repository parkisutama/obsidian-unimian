// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { Task } from "@jaeungkim/gantt-chart";

function chartTime(value: string): number {
	return Date.parse(
		`${value}${value.includes("T") && !/[zZ]|[+-]\d\d:\d\d$/.test(value) ? "Z" : ""}`,
	);
}

/**
 * Rebuilds summary dates bottom-up from normalized direct children.
 *
 * A summary drag is reported with dates for both the summary and all descendants. The library may
 * clamp the summary itself to sub-day boundaries even when it is stored as Date. That intermediate
 * range must not be validated or persisted as an independent edit.
 */
export function rollUpPhaseDates(tasks: Task[], phaseIds: ReadonlySet<string>): Task[] {
	if (phaseIds.size === 0) return tasks;
	const byId = new Map(tasks.map((task) => [task.id, task]));
	const children = new Map<string, string[]>();
	for (const task of tasks)
		if (task.parentId && byId.has(task.parentId)) {
			const list = children.get(task.parentId);
			if (list) list.push(task.id);
			else children.set(task.parentId, [task.id]);
		}
	const visiting = new Set<string>();
	const rolled = new Set<string>();
	const roll = (id: string): void => {
		if (rolled.has(id) || visiting.has(id)) return;
		visiting.add(id);
		const childIds = children.get(id) ?? [];
		for (const childId of childIds) if (phaseIds.has(childId)) roll(childId);
		const spans = childIds
			.map((childId) => byId.get(childId))
			.filter((task): task is Task => task !== undefined);
		const phase = byId.get(id);
		if (phase && spans.length > 0) {
			const startDate = spans.reduce(
				(earliest, task) =>
					chartTime(task.startDate) < chartTime(earliest) ? task.startDate : earliest,
				spans[0]!.startDate,
			);
			const endDate = spans.reduce(
				(latest, task) => (chartTime(task.endDate) > chartTime(latest) ? task.endDate : latest),
				spans[0]!.endDate,
			);
			if (phase.startDate !== startDate || phase.endDate !== endDate)
				byId.set(id, { ...phase, startDate, endDate });
		}
		visiting.delete(id);
		rolled.add(id);
	};
	for (const id of phaseIds) roll(id);
	return tasks.map((task) => byId.get(task.id) ?? task);
}
