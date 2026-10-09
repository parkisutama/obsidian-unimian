// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { GanttDetailRenderProps, Task, TaskDependency } from "@jaeungkim/gantt-chart";
import { type ComponentChild, h } from "preact";
import type { NormalizedValue } from "../../core/entries/NormalizedValue";
import { type GanttPropertyDateType, readGanttDate, writeGanttDate } from "../../core/gantt/dates";

const ZONED_DATE = /(?:Z|[+-]\d{2}:\d{2})$/i;
const DURATION = /^\s*(\d+(?:\.\d+)?)\s*([mhd])\s*$/i;

export interface GanttDetailEntry {
	dateProperties: { start: string | null; end: string | null };
	dateTypes: { start: GanttPropertyDateType; end: GanttPropertyDateType };
	propertyNames: ReadonlyMap<string, string>;
	values: ReadonlyMap<string, NormalizedValue>;
	visibleProperties: readonly string[];
}

export interface GanttLinkedTask {
	id: string;
	name: string;
}

/** Derived from Depends on (see core/gantt/dependencyStatus); nothing here is stored. */
export interface GanttDependencyInfo {
	/** Tasks that depend on this one. */
	blocks: GanttLinkedTask[];
	/** Predecessors that are not finished. */
	incomplete: number;
	/** Predecessors that finish after this task starts. */
	conflicts: number;
}

export interface GanttDetailPanelOptions {
	dependencyInfo?: (taskId: string) => GanttDependencyInfo;
	taskName?: (taskId: string) => string | null;
	canEditEnd: boolean;
	canEditDependencies: boolean;
	canEditProgress: boolean;
	canEditStart: boolean;
	dependsOnProperty: string | null;
	entry: GanttDetailEntry | null;
	localTimeZone: string;
	/** `event` carries the modifier keys, so Ctrl/Cmd, Alt and Shift pick the destination pane. */
	onOpenNote: (path: string, event?: MouseEvent) => void;
	onExactDateUpdate: (
		taskId: string,
		boundary: "start" | "end",
		type: GanttPropertyDateType,
	) => void;
	onRemoveDependency: (taskId: string, dependency: TaskDependency) => boolean;
	progressProperty: string | null;
}

function basename(path: string): string {
	const name = path.split("/").at(-1) ?? path;
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

function inputDate(value: string, type: GanttPropertyDateType, boundary: "start" | "end"): string {
	return writeGanttDate(value, type, boundary) ?? "";
}

function chartDate(
	value: string,
	type: GanttPropertyDateType,
	boundary: "start" | "end",
): string | null {
	return readGanttDate(value, type, boundary);
}

/**
 * Chart dates are floating UTC: plain after a Bases echo (`2026-10-02`, `2026-10-02T09:00`), but
 * ISO with a trailing Z straight after an edit. Appending another Z to the latter is NaN, which
 * blanked the Duration field and made typing a duration a silent no-op.
 */
function chartMilliseconds(value: string): number {
	return Date.parse(ZONED_DATE.test(value) ? value : `${value}Z`);
}

function durationMilliseconds(start: string, end: string): number {
	return chartMilliseconds(end) - chartMilliseconds(start);
}

function durationLabel(start: string, end: string): string {
	const milliseconds = durationMilliseconds(start, end);
	if (!Number.isFinite(milliseconds)) return "";
	if (milliseconds % 86_400_000 === 0) return `${milliseconds / 86_400_000}d`;
	if (milliseconds % 3_600_000 === 0) return `${milliseconds / 3_600_000}h`;
	return `${Math.round(milliseconds / 60_000)}m`;
}

function durationEnd(start: string, value: string, dateType: GanttPropertyDateType): string | null {
	const match = DURATION.exec(value);
	if (!match) return null;
	const amount = Number(match[1]);
	const unit = match[2]!.toLowerCase();
	if (
		!Number.isFinite(amount) ||
		amount < 0 ||
		(dateType === "date" && (unit !== "d" || !Number.isInteger(amount) || amount < 1))
	)
		return null;
	const multiplier = unit === "d" ? 86_400_000 : unit === "h" ? 3_600_000 : 60_000;
	const startTime = chartMilliseconds(start);
	return Number.isFinite(startTime)
		? new Date(startTime + amount * multiplier).toISOString()
		: null;
}

function valueText(value: NormalizedValue | undefined): string {
	if (!value || value.kind === "missing") return "—";
	if (value.kind === "text" || value.kind === "date") return value.value;
	if (value.kind === "number" || value.kind === "boolean") return String(value.value);
	if (value.kind === "link") return value.display ?? value.target;
	if (value.kind === "file") return value.path;
	if (value.kind === "list") return value.items.map(valueText).join(", ");
	return "Unsupported value";
}

function hasZonedDate(entry: GanttDetailEntry | null): boolean {
	if (!entry) return false;
	return [entry.dateProperties.start, entry.dateProperties.end].some((property) => {
		const value = property ? entry.values.get(property) : undefined;
		return value?.kind === "date" && value.hasTime && ZONED_DATE.test(value.value);
	});
}

function field(label: string, control: ComponentChild, wide = false): ComponentChild {
	return h(
		"label",
		{
			class: wide
				? "unimian-gantt-detail__field unimian-gantt-detail__field--wide"
				: "unimian-gantt-detail__field",
		},
		h("span", { class: "unimian-gantt-detail__label" }, label),
		control,
	);
}

export function renderGanttDetail(
	props: GanttDetailRenderProps,
	options: GanttDetailPanelOptions,
): ComponentChild {
	const task = props.task as Task;
	const entry = options.entry;
	const startType = entry?.dateTypes.start ?? "date";
	const endType = entry?.dateTypes.end ?? startType;
	const editableEndType: GanttPropertyDateType = startType === "datetime" ? "datetime" : endType;
	const editableStart = options.canEditStart && !task.readOnly && task.allowMove !== false;
	const editableEnd = options.canEditEnd && !task.readOnly && task.allowResize !== false;
	const updateDate = (boundary: "start" | "end", value: string) => {
		const type = boundary === "start" ? startType : editableEndType;
		const next = chartDate(value, type, boundary);
		if (next) {
			options.onExactDateUpdate(task.id, boundary, type);
			props.update(boundary === "start" ? { startDate: next } : { endDate: next });
		}
	};
	const dependencies = task.dependencies ?? [];
	const info = options.dependencyInfo?.(task.id);
	const noteLink = (id: string, label: string) =>
		h(
			"button",
			{
				class: "unimian-gantt-detail__link",
				type: "button",
				"data-note-path": id,
				onClick: (event: MouseEvent) => options.onOpenNote(id, event),
			},
			label,
		);
	const duration = durationLabel(task.startDate, task.endDate);
	return h(
		"div",
		{ class: "unimian-gantt-detail" },
		h(
			"div",
			{ class: "unimian-gantt-detail__top" },
			h(
				"button",
				{
					class: "clickable-icon unimian-gantt-detail__close",
					type: "button",
					"aria-label": "Close details",
					onClick: props.close,
				},
				"×",
			),
		),
		h(
			"button",
			{
				class: "unimian-gantt-detail__title",
				type: "button",
				"data-note-path": task.id,
				onClick: (event: MouseEvent) => options.onOpenNote(task.id, event),
			},
			task.name,
		),
		h(
			"div",
			{ class: "unimian-gantt-detail__fields" },
			field(
				"Start",
				h("input", {
					type: startType === "date" ? "date" : "datetime-local",
					value: inputDate(task.startDate, startType, "start"),
					disabled: !editableStart,
					onChange: (event: Event) =>
						updateDate("start", (event.currentTarget as HTMLInputElement).value),
				}),
				true,
			),
			field(
				"End",
				h("input", {
					type: editableEndType === "date" ? "date" : "datetime-local",
					value: inputDate(task.endDate, editableEndType, "end"),
					disabled: !editableEnd,
					onChange: (event: Event) =>
						updateDate("end", (event.currentTarget as HTMLInputElement).value),
				}),
				true,
			),
			field(
				"Duration",
				h("input", {
					type: "text",
					value: duration,
					disabled: !editableEnd,
					"aria-label": "Duration",
					onChange: (event: Event) => {
						const input = event.currentTarget as HTMLInputElement;
						const endDate = durationEnd(task.startDate, input.value, editableEndType);
						input.setCustomValidity(
							endDate
								? ""
								: startType === "date" && endType === "date"
									? "Use whole days, for example 2d."
									: "Use minutes, hours, or days, for example 90m, 2h, or 1d.",
						);
						if (endDate) {
							options.onExactDateUpdate(task.id, "end", editableEndType);
							props.update({ endDate });
						}
					},
				}),
			),
			options.progressProperty
				? field(
						"Progress",
						h("input", {
							type: "number",
							min: 0,
							max: 100,
							step: 1,
							value: task.progress ?? 0,
							disabled:
								!options.canEditProgress || task.readOnly || task.allowProgressChange === false,
							onChange: (event: Event) =>
								props.update({
									progress: Math.max(
										0,
										Math.min(
											100,
											Math.round(Number((event.currentTarget as HTMLInputElement).value)),
										),
									),
								}),
						}),
					)
				: null,
			hasZonedDate(entry)
				? h(
						"div",
						{ class: "unimian-gantt-detail__timezone" },
						`Local time · ${options.localTimeZone}`,
					)
				: null,
		),
		options.dependsOnProperty && dependencies.length > 0
			? h(
					"section",
					{ class: "unimian-gantt-detail__dependencies" },
					h("div", { class: "unimian-gantt-detail__section-title" }, "Depends on"),
					info && info.conflicts > 0
						? h(
								"div",
								{ class: "unimian-gantt-detail__warning unimian-gantt-detail__warning--conflict" },
								`Starts before ${info.conflicts} predecessor${info.conflicts === 1 ? " finishes" : "s finish"}.`,
							)
						: null,
					info && info.incomplete > 0
						? h(
								"div",
								{ class: "unimian-gantt-detail__warning" },
								`Waiting on ${info.incomplete} unfinished predecessor${info.incomplete === 1 ? "" : "s"}.`,
							)
						: null,
					...dependencies.map((dependency) =>
						h(
							"div",
							{
								class: "unimian-gantt-detail__dependency",
								key: `${dependency.type}:${dependency.targetId}`,
							},
							noteLink(
								dependency.targetId,
								options.taskName?.(dependency.targetId) ?? basename(dependency.targetId),
							),
							h(
								"button",
								{
									type: "button",
									"aria-label": `Remove dependency ${dependency.targetId}`,
									disabled:
										!options.canEditDependencies || task.readOnly || task.allowLinkDelete === false,
									onClick: () => {
										if (options.onRemoveDependency(task.id, dependency))
											props.update({
												dependencies: dependencies.filter((item) => item !== dependency),
											});
									},
								},
								"×",
							),
						),
					),
				)
			: null,
		info && info.blocks.length > 0
			? h(
					"section",
					{ class: "unimian-gantt-detail__blocks" },
					h("div", { class: "unimian-gantt-detail__section-title" }, "Blocks"),
					...info.blocks.map((blocked) =>
						h(
							"div",
							{ class: "unimian-gantt-detail__dependency", key: blocked.id },
							noteLink(blocked.id, blocked.name),
						),
					),
				)
			: null,
		entry && entry.visibleProperties.length > 0
			? h(
					"section",
					{ class: "unimian-gantt-detail__properties" },
					h("div", { class: "unimian-gantt-detail__section-title" }, "Properties"),
					...entry.visibleProperties.map((property) =>
						h(
							"div",
							{ class: "unimian-gantt-detail__property", key: property },
							h(
								"span",
								{ class: "unimian-gantt-detail__property-name" },
								entry.propertyNames.get(property) ?? property,
							),
							h(
								"span",
								{ class: "unimian-gantt-detail__property-value" },
								valueText(entry.values.get(property)),
							),
						),
					),
				)
			: null,
	);
}
