// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { Task } from "@jaeungkim/gantt-chart";
import type { EntrySnapshot } from "../../core/entries/EntrySnapshot";
import type { NormalizedValue } from "../../core/entries/NormalizedValue";
import { readGanttDate } from "../../core/gantt/dates";
import { parseGanttDependencies, wikiLinkText } from "../../core/gantt/dependencies";
import { buildPhaseTree, type PhaseGroup, type PhaseInput } from "../../core/gantt/phases";
import { parseGanttProgress } from "../../core/gantt/progress";
import { compareSequence } from "../../core/gantt/sequence";
import type { EntrySnapshotGroup } from "../../platform/bases/entrySnapshotAdapter";
import type { GanttOptions, GanttScale } from "./options";

export interface GanttMappingServices {
	resolveLink(target: string, sourcePath: string): { path: string; name: string } | null;
	resolveColor(entry: EntrySnapshot, category: string | null): string | null;
}
export interface GanttUnresolvedLink {
	path: string;
	target: string;
}
export interface GanttMappingResult {
	tasks: Task[];
	unscheduled: EntrySnapshot[];
	cycles: string[];
	/** Depends on links that name no note in the vault (links to notes filtered out of the Base are not listed). */
	unresolved: GanttUnresolvedLink[];
}

function text(value: NormalizedValue | undefined): string | null {
	if (!value || value.kind === "missing") return null;
	if (value.kind === "text" || value.kind === "date") return value.value;
	if (value.kind === "number" || value.kind === "boolean") return String(value.value);
	if (value.kind === "link") return value.target;
	if (value.kind === "file") return value.path;
	return null;
}

function rawDependency(value: NormalizedValue | undefined): unknown {
	if (!value || value.kind === "missing") return undefined;
	if (value.kind === "list")
		return value.items
			.map((item) => (item.kind === "link" ? wikiLinkText(item.target) : text(item)))
			.filter(Boolean);
	if (value.kind === "link") return wikiLinkText(value.target);
	return text(value);
}

function groupLabel(value: NormalizedValue): string {
	return text(value) ?? "No value";
}

function addScaleStep(value: string, scale: GanttScale): string {
	const date = new Date(`${value}:00Z`);
	if (scale === "year") date.setUTCFullYear(date.getUTCFullYear() + 1);
	else if (scale === "quarter") date.setUTCMonth(date.getUTCMonth() + 3);
	else if (scale === "month") date.setUTCMonth(date.getUTCMonth() + 1);
	else date.setUTCDate(date.getUTCDate() + (scale === "week" ? 7 : 1));
	return date.toISOString().slice(0, 16);
}

function spanForChildren(
	id: string,
	tasks: ReadonlyMap<string, Task>,
	children: ReadonlyMap<string, string[]>,
): { start: string; end: string } | null {
	const spans: Array<{ start: string; end: string }> = [];
	for (const child of children.get(id) ?? []) {
		const task = tasks.get(child);
		if (task) spans.push({ start: task.startDate, end: task.endDate });
		else {
			const span = spanForChildren(child, tasks, children);
			if (span) spans.push(span);
		}
	}
	if (spans.length === 0) return null;
	const starts = spans.map((span) => span.start);
	const ends = spans.map((span) => span.end);
	return { start: starts.sort()[0]!, end: ends.sort().at(-1)! };
}

export function mapSnapshotsToGanttTasks(
	groups: readonly EntrySnapshotGroup[],
	options: GanttOptions,
	services: GanttMappingServices,
	grouped = false,
): GanttMappingResult {
	const entries = groups.flatMap((group) => group.entries);
	const groupByPath = new Map<string, PhaseGroup | null>();
	for (const [index, group] of groups.entries())
		for (const entry of group.entries) {
			groupByPath.set(
				entry.path,
				grouped ? { key: `${index}:${groupLabel(group.key)}`, label: groupLabel(group.key) } : null,
			);
		}
	const phaseInputs: PhaseInput[] = entries.map((entry) => {
		const parentTarget = options.parent ? text(entry.values.get(options.parent)) : null;
		const resolved = parentTarget ? services.resolveLink(parentTarget, entry.path) : null;
		const orderValue = options.order ? entry.values.get(options.order) : undefined;
		return {
			id: entry.path,
			name: options.label
				? (text(entry.values.get(options.label)) ?? entry.basename)
				: entry.basename,
			group: options.phases ? groupByPath.get(entry.path) : null,
			parent:
				options.phases && parentTarget
					? {
							id: resolved?.path ?? parentTarget,
							name: resolved?.name ?? parentTarget,
							resolved: resolved !== null,
						}
					: null,
			order: orderValue?.kind === "number" ? orderValue.value : null,
		};
	});
	const phaseTree = buildPhaseTree(phaseInputs, options.order !== null);
	const phaseById = new Map(phaseTree.nodes.map((node) => [node.id, node]));
	const tasks = new Map<string, Task>();
	const unscheduled: EntrySnapshot[] = [];
	const unresolved: GanttUnresolvedLink[] = [];

	for (const entry of entries) {
		const startValue = options.start ? entry.values.get(options.start) : undefined;
		if (startValue?.kind !== "date") {
			unscheduled.push(entry);
			continue;
		}
		const dateType = startValue?.kind === "date" && startValue.hasTime ? "datetime" : "date";
		const start = readGanttDate(startValue.value, dateType, "start");
		if (!start) {
			unscheduled.push(entry);
			continue;
		}
		const startSource = startValue.value;
		const endValue = options.end ? entry.values.get(options.end) : undefined;
		let end =
			endValue?.kind === "date"
				? readGanttDate(endValue.value, endValue.hasTime ? "datetime" : "date", "end")
				: null;
		if (!end)
			end =
				dateType === "date"
					? readGanttDate(startSource, "date", "end")!
					: addScaleStep(start, options.scale);
		const dependencies = parseGanttDependencies(
			{
				FS: rawDependency(options.dependsOn ? entry.values.get(options.dependsOn) : undefined),
			},
			(target) => services.resolveLink(target, entry.path)?.path ?? null,
			(target) => unresolved.push({ path: entry.path, target }),
		);
		const formulaDates = Boolean(
			options.start?.startsWith("formula.") || options.end?.startsWith("formula."),
		);
		const category = options.colorBy ? text(entry.values.get(options.colorBy)) : null;
		const phase = phaseById.get(entry.path)!;
		const progress = parseGanttProgress(
			options.progress ? text(entry.values.get(options.progress)) : undefined,
			options.showProgress,
		);
		const color = services.resolveColor(entry, category);
		tasks.set(entry.path, {
			id: entry.path,
			name: phase.name,
			startDate: start,
			endDate: end,
			parentId: options.phases ? phase.parentId : null,
			sequence: phase.sequence,
			...(progress === undefined ? {} : { progress }),
			...(color ? { color } : {}),
			...(dependencies.length ? { dependencies } : {}),
			allowMove: formulaDates ? false : undefined,
			allowResize: formulaDates ? false : undefined,
		});
	}

	const children = new Map<string, string[]>();
	for (const node of phaseTree.nodes)
		if (node.parentId) {
			const list = children.get(node.parentId);
			if (list) list.push(node.id);
			else children.set(node.parentId, [node.id]);
		}
	for (const node of [...phaseTree.nodes].reverse()) {
		if (tasks.has(node.id)) continue;
		const span = spanForChildren(node.id, tasks, children);
		if (!span) continue;
		tasks.set(node.id, {
			id: node.id,
			name: node.name,
			startDate: span.start,
			endDate: span.end,
			parentId: node.parentId,
			sequence: node.sequence,
			readOnly: node.synthetic,
			allowMove: false,
			allowResize: false,
			allowProgressChange: false,
			allowLinkCreate: false,
			allowLinkDelete: false,
			allowReorder: false,
		});
	}
	return {
		tasks: [...tasks.values()].sort((a, b) => compareSequence(a.sequence, b.sequence)),
		unscheduled,
		cycles: phaseTree.cycles,
		unresolved,
	};
}
