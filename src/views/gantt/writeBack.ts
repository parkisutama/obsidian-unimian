// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type {
	GanttDependencyChange,
	GanttTaskDraft,
	GanttTaskMoveChange,
	Task,
} from "@jaeungkim/gantt-chart";
import { applyGanttDependencyPolicy, type GanttDependencyPolicy } from "../../core/gantt/cascade";
import { readGanttDate, writeGanttDate } from "../../core/gantt/dates";
import { diffGanttTasks } from "../../core/gantt/diff";
import {
	buildGanttMutationPlan,
	type GanttMutationPlanOptions,
} from "../../core/gantt/mutationPlan";
import { SYNTHETIC_PHASE_PREFIX } from "../../core/gantt/phases";
import type { GrantedMutations } from "../../platform/mutations/grants";
import type { MutationResult } from "../../platform/mutations/types";
import type { GanttScale } from "./options";
import { rollUpPhaseDates } from "./phaseRollup";

interface BaselineValues {
	currentOrder?: ReadonlyMap<string, number | null | undefined>;
	currentDependsOn?: ReadonlyMap<string, unknown>;
}

export interface GanttWriteBackOptions {
	mutations: GrantedMutations;
	properties: GanttMutationPlanOptions;
	/**
	 * Restores the chart to `tasks` after a failed write. The library ignores a `tasks` prop whose
	 * contents equal the last one it was given, so the host must remount rather than re-pass.
	 */
	revertTasks(tasks: Task[]): void;
	notice(message: string): void;
	createTask?(draft: GanttTaskDraft): Promise<void>;
	dependencyPolicy?: GanttDependencyPolicy;
	writePhaseDates?: boolean;
	scale?: GanttScale;
	/** Applies cascade results without remounting the chart. */
	renderTasks?(tasks: Task[]): void;
	/** Holds Bases re-renders while writes are in flight (see EchoGate). */
	gate?: { begin(): void; end(): void };
}

function failed(message: string): MutationResult {
	return { ok: false, reason: "error", message };
}

function canonicalDate(
	value: string,
	type: "date" | "datetime",
	boundary: "start" | "end",
): string {
	if (type === "datetime") return writeGanttDate(value, type, boundary) ?? value;
	const stored = writeGanttDate(value, type, boundary);
	return stored ? (readGanttDate(stored, type, boundary) ?? value) : value;
}

function chartTime(value: string): number {
	return Date.parse(
		`${value}${value.includes("T") && !/[zZ]|[+-]\d\d:\d\d$/.test(value) ? "Z" : ""}`,
	);
}

function hasReversedRange(task: Task, endType: "date" | "datetime"): boolean {
	// Date tasks use an exclusive chart end, so equality would persist as an inclusive end one day
	// before the start. Date & time tasks may intentionally be zero-duration milestones.
	const start = chartTime(task.startDate);
	const end = chartTime(task.endDate);
	return (
		Number.isFinite(start) &&
		Number.isFinite(end) &&
		(endType === "date" ? end <= start : end < start)
	);
}

const DAY_MS = 86_400_000;
const FIXED_SNAP_MS: Record<"day" | "week", number> = { day: DAY_MS, week: 7 * DAY_MS };

function isoAt(milliseconds: number): string {
	return new Date(milliseconds).toISOString();
}

function addUtcMonths(milliseconds: number, months: number): number {
	const date = new Date(milliseconds);
	const day = date.getUTCDate();
	date.setUTCDate(1);
	date.setUTCMonth(date.getUTCMonth() + months);
	const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
	date.setUTCDate(Math.min(day, lastDay));
	return date.getTime();
}

function snappedBoundary(
	baseline: string,
	proposed: string,
	type: "date" | "datetime",
	scale: GanttScale,
): string {
	const from = chartTime(baseline);
	const to = chartTime(proposed);
	if (!Number.isFinite(from) || !Number.isFinite(to)) return proposed;
	const delta = to - from;
	if (delta === 0) return baseline;
	if (type === "date") return isoAt(from + Math.round(delta / DAY_MS) * DAY_MS);
	if (scale === "day") return proposed;
	if (scale === "week" || scale === "month") {
		const unit = scale === "week" ? FIXED_SNAP_MS.day : FIXED_SNAP_MS.week;
		return isoAt(from + Math.round(delta / unit) * unit);
	}
	const monthsPerStep = scale === "quarter" ? 1 : 3;
	const approximateStep = monthsPerStep * 30.4375 * DAY_MS;
	return isoAt(addUtcMonths(from, Math.round(delta / approximateStep) * monthsPerStep));
}

function snapTask(
	task: Task,
	baseline: Task | undefined,
	types: { start: "date" | "datetime"; end: "date" | "datetime" },
	scale: GanttScale,
): Task {
	if (!baseline) return task;
	const startChanged = task.startDate !== baseline.startDate;
	const endChanged = task.endDate !== baseline.endDate;
	if (!startChanged && !endChanged) return task;
	const startDelta = chartTime(task.startDate) - chartTime(baseline.startDate);
	const endDelta = chartTime(task.endDate) - chartTime(baseline.endDate);
	if (startChanged && endChanged && startDelta === endDelta) {
		const snappedStart = snappedBoundary(baseline.startDate, task.startDate, types.start, scale);
		const snappedDelta = chartTime(snappedStart) - chartTime(baseline.startDate);
		return {
			...task,
			startDate: snappedStart,
			endDate: isoAt(chartTime(baseline.endDate) + snappedDelta),
		};
	}
	return {
		...task,
		startDate: startChanged
			? snappedBoundary(baseline.startDate, task.startDate, types.start, scale)
			: task.startDate,
		endDate: endChanged
			? snappedBoundary(baseline.endDate, task.endDate, types.end, scale)
			: task.endDate,
	};
}

/**
 * Converts controlled chart gestures into the smallest scoped mutation calls. It owns only an
 * immutable task baseline and plain frontmatter values; no live Bases object crosses an update.
 */
export class GanttWriteBack {
	private baseline: Task[];
	private indexed: { source: Task[]; byId: Map<string, Task> } | null = null;
	private properties: GanttMutationPlanOptions;
	private queue: Promise<void> = Promise.resolve();
	private epoch = 0;
	private dependencyPolicy: GanttDependencyPolicy;
	private writePhaseDates: boolean;
	private scale: GanttScale;
	private pendingDependencyChange = false;
	private readonly pendingExactDateTypes = new Map<
		string,
		Partial<Record<"start" | "end", "date" | "datetime">>
	>();

	constructor(
		tasks: Task[],
		private readonly options: GanttWriteBackOptions,
	) {
		this.baseline = tasks;
		this.properties = options.properties;
		this.dependencyPolicy = options.dependencyPolicy ?? "none";
		this.writePhaseDates = options.writePhaseDates ?? false;
		this.scale = options.scale ?? "day";
	}

	get tasks(): Task[] {
		return this.baseline;
	}

	/** Id lookup for the current baseline, rebuilt only when the baseline is replaced. */
	private baselineById(): ReadonlyMap<string, Task> {
		if (this.indexed?.source !== this.baseline) {
			this.indexed = {
				source: this.baseline,
				byId: new Map(this.baseline.map((task) => [task.id, task])),
			};
		}
		return this.indexed.byId;
	}

	replaceProperties(properties: GanttMutationPlanOptions): void {
		this.properties = properties;
	}

	replaceScheduleOptions(
		dependencyPolicy: GanttDependencyPolicy,
		writePhaseDates: boolean,
		scale: GanttScale = this.scale,
	): void {
		this.dependencyPolicy = dependencyPolicy;
		this.writePhaseDates = writePhaseDates;
		this.scale = scale;
	}

	replaceBaseline(tasks: Task[], values: BaselineValues = {}): void {
		this.baseline = tasks;
		this.properties = { ...this.properties, ...values };
	}

	onDependencyCreate(change: GanttDependencyChange): boolean {
		if (change.type === "FS" && this.properties.dependsOn && this.options.mutations.dependency) {
			this.pendingDependencyChange = true;
			return true;
		}
		this.options.notice("Gantt currently supports finish-to-start dependencies only.");
		return false;
	}

	onDependencyDelete(change: GanttDependencyChange): boolean {
		return this.onDependencyCreate(change);
	}

	onExactDateUpdate(taskId: string, boundary: "start" | "end", type: "date" | "datetime"): void {
		this.pendingExactDateTypes.set(taskId, {
			...this.pendingExactDateTypes.get(taskId),
			[boundary]: type,
		});
	}

	onTaskMove(change: GanttTaskMoveChange): boolean {
		if (change.toParentId?.startsWith(SYNTHETIC_PHASE_PREFIX)) {
			this.options.notice("Tasks cannot be moved into a synthetic Base group.");
			return false;
		}
		if (change.fromParentId === change.toParentId && !this.properties.order) {
			this.options.notice("Configure an Order property before reordering rows.");
			return false;
		}
		if (change.fromParentId !== change.toParentId && !this.properties.parent) {
			this.options.notice("Configure a Parent property before moving tasks between phases.");
			return false;
		}
		return true;
	}

	async onTaskCreate(draft: GanttTaskDraft): Promise<void> {
		if (!this.options.createTask) {
			this.options.notice("Task creation is not available.");
			return;
		}
		const type = this.properties.end?.type ?? null;
		if (
			type &&
			hasReversedRange({ ...draft, id: "", name: "", parentId: null, sequence: "" }, type)
		) {
			this.options.notice("End must not be earlier than start.");
			return;
		}
		try {
			await this.options.createTask(draft);
		} catch (error) {
			this.options.notice(
				`Could not create Gantt note: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Gestures are applied strictly in order, each diffed against the state the previous one left
	 * behind. A failed gesture voids every gesture queued before its revert, because the chart is
	 * remounted from the pre-failure baseline and those later arrays still contain the failed edit.
	 */
	onTasksChange(nextTasks: Task[]): Promise<void> {
		const epoch = this.epoch;
		const allowDependencyChange = this.pendingDependencyChange;
		this.pendingDependencyChange = false;
		const exactDateTypes = new Map(this.pendingExactDateTypes);
		this.pendingExactDateTypes.clear();
		const baselineById = this.baselineById();
		const dateNormalizedTasks = nextTasks.map((task) => {
			const types = this.properties.dateTypes?.get(task.id);
			const exactTypes = exactDateTypes.get(task.id);
			const startType = exactTypes?.start ?? types?.start ?? this.properties.start?.type;
			const endType = exactTypes?.end ?? types?.end ?? this.properties.end?.type;
			const baseline = baselineById.get(task.id);
			const snapped =
				startType && !exactDateTypes.has(task.id)
					? snapTask(task, baseline, { start: startType, end: endType ?? startType }, this.scale)
					: task;
			const startDate = startType
				? canonicalDate(snapped.startDate, startType, "start")
				: snapped.startDate;
			const endDate = endType ? canonicalDate(snapped.endDate, endType, "end") : snapped.endDate;
			return startDate === task.startDate && endDate === task.endDate
				? task
				: { ...task, startDate, endDate };
		});
		const preservedTasks = allowDependencyChange
			? dateNormalizedTasks
			: dateNormalizedTasks.map((task) => {
					const previous = baselineById.get(task.id);
					if (!previous || task.dependencies === previous.dependencies) return task;
					return { ...task, dependencies: previous.dependencies };
				});
		const ids = new Set(preservedTasks.map((task) => task.id));
		const phaseIds = new Set(
			preservedTasks
				.map((task) => task.parentId)
				.filter((id): id is string => id !== null && ids.has(id)),
		);
		const rolledUpTasks = rollUpPhaseDates(preservedTasks, phaseIds);
		const normalizedTasks = rolledUpTasks.every((task, index) => task === nextTasks[index])
			? nextTasks
			: rolledUpTasks;
		this.options.gate?.begin();
		const job = this.queue
			.then(() =>
				epoch === this.epoch ? this.apply(normalizedTasks, nextTasks, exactDateTypes) : undefined,
			)
			.finally(() => this.options.gate?.end());
		this.queue = job.catch(() => undefined);
		return job;
	}

	private async apply(
		nextTasks: Task[],
		sourceTasks: Task[] = nextTasks,
		dateTypeOverrides: ReadonlyMap<
			string,
			Partial<Record<"start" | "end", "date" | "datetime">>
		> = new Map(),
	): Promise<void> {
		const previous = this.baseline;
		const previousById = this.baselineById();
		const dateTypes = new Map(this.properties.dateTypes);
		for (const [id, override] of dateTypeOverrides) {
			const current = dateTypes.get(id);
			if (current)
				dateTypes.set(id, {
					start: override.start ?? current.start,
					end: override.end ?? current.end,
				});
		}
		const effectiveProperties = { ...this.properties, dateTypes };
		const ids = new Set(nextTasks.map((task) => task.id));
		const phaseIds = new Set(
			nextTasks
				.map((task) => task.parentId)
				.filter((id): id is string => id !== null && ids.has(id)),
		);
		const reversed = nextTasks.find((task) => {
			if (task.id.startsWith(SYNTHETIC_PHASE_PREFIX)) return false;
			if (!this.writePhaseDates && phaseIds.has(task.id)) return false;
			if (!this.properties.end) return false;
			const baselineTask = previousById.get(task.id);
			if (
				baselineTask &&
				baselineTask.startDate === task.startDate &&
				baselineTask.endDate === task.endDate
			)
				return false;
			const type = effectiveProperties.dateTypes.get(task.id)?.end ?? this.properties.end.type;
			return type ? hasReversedRange(task, type) : false;
		});
		if (reversed) {
			this.epoch += 1;
			this.options.revertTasks(previous);
			this.options.notice(`Could not save ${reversed.name}: end must not be earlier than start.`);
			return;
		}
		const scheduledTasks = applyGanttDependencyPolicy(previous, nextTasks, this.dependencyPolicy);
		const plan = buildGanttMutationPlan(diffGanttTasks(previous, scheduledTasks), {
			...effectiveProperties,
			phaseIds,
			writePhaseDates: this.writePhaseDates,
		});
		if (plan.length === 0) {
			this.baseline = scheduledTasks;
			if (scheduledTasks.some((task, index) => task !== sourceTasks[index]))
				this.options.renderTasks?.(scheduledTasks);
			return;
		}

		let failureMessage: string | null = null;
		try {
			const results = await Promise.all(
				plan.flatMap((item) => this.writeItem(item.path, item.values, effectiveProperties)),
			);
			const failure = results.find((result) => !result.ok);
			if (failure && !failure.ok) failureMessage = failure.message;
		} catch (error) {
			failureMessage = error instanceof Error ? error.message : String(error);
		}

		if (failureMessage !== null) {
			this.epoch += 1;
			this.options.revertTasks(previous);
			this.options.notice(`Could not save Gantt change: ${failureMessage}`);
			return;
		}
		this.baseline = scheduledTasks;
		this.rememberWrites(plan);
		if (scheduledTasks.some((task, index) => task !== sourceTasks[index]))
			this.options.renderTasks?.(scheduledTasks);
	}

	/**
	 * Bases echoes a write only after the metadata cache catches up. A second gesture on the same note
	 * inside that window must build on what was just written, not on the stale echo, or it would
	 * overwrite the first (a second dependency replacing the first).
	 */
	private rememberWrites(plan: readonly { path: string; values: Record<string, unknown> }[]): void {
		const { dependsOn, order } = this.properties;
		let currentDependsOn = this.properties.currentDependsOn;
		let currentOrder = this.properties.currentOrder;
		for (const item of plan) {
			if (dependsOn && Object.hasOwn(item.values, dependsOn)) {
				currentDependsOn = new Map(currentDependsOn).set(item.path, item.values[dependsOn]);
			}
			if (order && Object.hasOwn(item.values, order)) {
				const value = item.values[order];
				currentOrder = new Map(currentOrder).set(
					item.path,
					typeof value === "number" ? value : null,
				);
			}
		}
		this.properties = { ...this.properties, currentDependsOn, currentOrder };
	}

	private writeItem(
		path: string,
		values: Record<string, unknown>,
		properties: GanttMutationPlanOptions = this.properties,
	): Promise<MutationResult>[] {
		const remaining = { ...values };
		const calls: Promise<MutationResult>[] = [];
		const start = properties.start;
		const end = properties.end;

		if (start && Object.hasOwn(remaining, start.id)) {
			const startValue = remaining[start.id];
			const endValue = end && Object.hasOwn(remaining, end.id) ? remaining[end.id] : undefined;
			delete remaining[start.id];
			if (end) delete remaining[end.id];
			calls.push(
				this.options.mutations.date?.updateRange(
					path,
					start.id,
					String(startValue),
					end?.id,
					endValue == null ? null : String(endValue),
				) ?? Promise.resolve(failed("Date mutation capability is unavailable.")),
			);
		} else if (end && Object.hasOwn(remaining, end.id)) {
			const endValue = remaining[end.id];
			delete remaining[end.id];
			const current = this.baselineById().get(path);
			const startType = properties.dateTypes?.get(path)?.start ?? start?.type;
			const currentStart =
				current && startType ? writeGanttDate(current.startDate, startType, "start") : null;
			calls.push(
				currentStart && start
					? (this.options.mutations.date?.updateRange(
							path,
							start.id,
							currentStart,
							end.id,
							endValue == null ? null : String(endValue),
						) ?? Promise.resolve(failed("Date mutation capability is unavailable.")))
					: Promise.resolve(failed("The task start date is unavailable.")),
			);
		}

		const dependency = properties.dependsOn;
		if (dependency && Object.hasOwn(remaining, dependency)) {
			const value = remaining[dependency];
			delete remaining[dependency];
			calls.push(
				this.options.mutations.dependency?.setDependencies(path, dependency, value) ??
					Promise.resolve(failed("Dependency mutation capability is unavailable.")),
			);
		}

		if (Object.keys(remaining).length > 0) {
			calls.push(
				this.options.mutations.property?.setProperties(path, remaining) ??
					Promise.resolve(failed("Property mutation capability is unavailable.")),
			);
		}
		return calls;
	}
}
