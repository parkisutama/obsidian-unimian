// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { BasesAllOptions, BasesPropertyId, BasesViewConfig, TFile } from "obsidian";
import { ViewConfigReader } from "../../platform/bases/ViewConfigReader";

export const GANTT_SCALES = ["day", "week", "month", "quarter", "year"] as const;
export type GanttScale = (typeof GANTT_SCALES)[number];
export const GANTT_DEPENDENCY_SHIFTS = ["none", "overlap", "maintain-gap"] as const;
export type GanttDependencyShift = (typeof GANTT_DEPENDENCY_SHIFTS)[number];

export function readCollapsedIds(value: unknown): string[] {
	if (typeof value !== "string" || value.length === 0) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed)
			? [...new Set(parsed.filter((id): id is string => typeof id === "string"))]
			: [];
	} catch {
		return [];
	}
}

export interface GanttOptions {
	start: BasesPropertyId | null;
	end: BasesPropertyId | null;
	label: BasesPropertyId | null;
	parent: BasesPropertyId | null;
	order: BasesPropertyId | null;
	progress: BasesPropertyId | null;
	colorBy: BasesPropertyId | null;
	dependsOn: BasesPropertyId | null;
	scale: GanttScale;
	showNonWorkingDays: boolean;
	workingWeekdays: string;
	holidays: string;
	snapToWorkingDays: boolean;
	firstDayOfWeek: number;
	zoomOnWheel: boolean;
	infiniteScroll: boolean;
	scrollToToday: boolean;
	phases: boolean;
	showTaskList: boolean;
	showRowNumbers: boolean;
	showDetail: boolean;
	showProgress: boolean;
	showTooltip: boolean;
	rowHeight: number;
	readOnly: boolean;
	allowMove: boolean;
	allowResize: boolean;
	allowProgress: boolean;
	allowLinkCreate: boolean;
	allowLinkDelete: boolean;
	allowReorder: boolean;
	allowTaskCreate: boolean;
	dependencyShift: GanttDependencyShift;
	writePhaseDates: boolean;
	templatePath: string;
	targetFolder: string;
	titleFormat: string;
	collapsedIds: string[];
}

export function readGanttOptions(config: BasesViewConfig): GanttOptions {
	const r = new ViewConfigReader(config);
	return {
		start: r.getPropertyId("ganttStart"),
		end: r.getPropertyId("ganttEnd"),
		label: r.getPropertyId("ganttLabel"),
		parent: r.getPropertyId("ganttParent"),
		order: r.getPropertyId("ganttOrder"),
		progress: r.getPropertyId("ganttProgress"),
		colorBy: r.getPropertyId("ganttColorBy"),
		dependsOn: r.getPropertyId("ganttDependencyFS"),
		scale: r.getEnum("ganttScale", GANTT_SCALES, "month"),
		showNonWorkingDays: r.getBoolean("ganttShowNonWorkingDays", true),
		workingWeekdays: r.getString("ganttWorkingWeekdays", "1,2,3,4,5"),
		holidays: r.getOptionalString("ganttHolidays") ?? "",
		snapToWorkingDays: r.getBoolean("ganttSnapToWorkingDays", false),
		firstDayOfWeek: r.getNumber("ganttFirstDayOfWeek", 1),
		zoomOnWheel: r.getBoolean("ganttZoomOnWheel", false),
		infiniteScroll: r.getBoolean("ganttInfiniteScroll", false),
		scrollToToday: r.getBoolean("ganttScrollToToday", true),
		phases: r.getBoolean("ganttPhases", true),
		showTaskList: r.getBoolean("ganttShowTaskList", true),
		showRowNumbers: r.getBoolean("ganttShowRowNumbers", true),
		showDetail: r.getBoolean("ganttShowDetail", true),
		showProgress: r.getBoolean("ganttShowProgress", true),
		showTooltip: r.getBoolean("ganttShowTooltip", true),
		rowHeight: Math.max(28, Math.min(80, r.getNumber("ganttRowHeight", 40))),
		readOnly: r.getBoolean("ganttReadOnly", true),
		allowMove: r.getBoolean("ganttAllowMove", true),
		allowResize: r.getBoolean("ganttAllowResize", true),
		allowProgress: r.getBoolean("ganttAllowProgress", true),
		allowLinkCreate: r.getBoolean("ganttAllowLinkCreate", true),
		allowLinkDelete: r.getBoolean("ganttAllowLinkDelete", true),
		allowReorder: r.getBoolean("ganttAllowReorder", true),
		allowTaskCreate: r.getBoolean("ganttAllowTaskCreate", true),
		dependencyShift: r.getEnum("ganttDependencyShift", GANTT_DEPENDENCY_SHIFTS, "none"),
		writePhaseDates: r.getBoolean("ganttWritePhaseDates", false),
		templatePath: r.getOptionalString("ganttTemplatePath") ?? "",
		targetFolder: r.getOptionalString("ganttTargetFolder") ?? "",
		titleFormat: r.getString("ganttTitleFormat", "New note {{date}}"),
		collapsedIds: readCollapsedIds(r.getOptionalString("ganttCollapsedIds")),
	};
}

const property = (key: string, displayName: string) => ({
	type: "property" as const,
	key,
	displayName,
	placeholder: "Select property...",
});
const toggle = (key: string, displayName: string, value: boolean) => ({
	type: "toggle" as const,
	key,
	displayName,
	default: value,
});

export function getGanttViewOptions(_config: BasesViewConfig): BasesAllOptions[] {
	return [
		{
			type: "group",
			displayName: "Properties",
			items: [
				property("ganttStart", "Start date"),
				property("ganttEnd", "End date"),
				property("ganttLabel", "Label"),
				property("ganttParent", "Parent (phase)"),
				property("ganttOrder", "Order"),
				property("ganttProgress", "Progress"),
				property("ganttColorBy", "Color by"),
				property("ganttDependencyFS", "Depends on"),
			],
		},
		{
			type: "group",
			displayName: "Timeline",
			items: [
				{
					type: "dropdown",
					key: "ganttScale",
					displayName: "Scale",
					default: "month",
					options: { day: "Day", week: "Week", month: "Month", quarter: "Quarter", year: "Year" },
				},
				toggle("ganttShowNonWorkingDays", "Show non-working days", true),
				{
					type: "text",
					key: "ganttWorkingWeekdays",
					displayName: "Working weekdays",
					default: "1,2,3,4,5",
					placeholder: "1,2,3,4,5",
				},
				{
					type: "text",
					key: "ganttHolidays",
					displayName: "Holidays",
					default: "",
					placeholder: "2026-01-01, 2026-12-25",
				},
				toggle("ganttSnapToWorkingDays", "Snap to working days", false),
				{
					type: "slider",
					key: "ganttFirstDayOfWeek",
					displayName: "First day of week",
					default: 1,
					min: 0,
					max: 6,
					step: 1,
				},
				toggle("ganttZoomOnWheel", "Zoom with Ctrl/Cmd + wheel", false),
				toggle("ganttInfiniteScroll", "Infinite scroll", false),
				toggle("ganttScrollToToday", "Scroll to today on open", true),
			],
		},
		{
			type: "group",
			displayName: "Layout",
			items: [
				toggle("ganttPhases", "Phases", true),
				toggle("ganttShowTaskList", "Task list", true),
				toggle("ganttShowRowNumbers", "Row numbers", true),
				toggle("ganttShowDetail", "Detail panel", true),
				toggle("ganttShowProgress", "Show progress", true),
				toggle("ganttShowTooltip", "Tooltip", true),
				{
					type: "slider",
					key: "ganttRowHeight",
					displayName: "Row height",
					default: 40,
					min: 28,
					max: 80,
					step: 2,
				},
			],
		},
		{
			type: "group",
			displayName: "Editing",
			items: [
				toggle("ganttReadOnly", "Read only", true),
				toggle("ganttAllowMove", "Move bars", true),
				toggle("ganttAllowResize", "Resize bars", true),
				toggle("ganttAllowProgress", "Edit progress", true),
				toggle("ganttAllowLinkCreate", "Draw dependencies", true),
				toggle("ganttAllowLinkDelete", "Delete dependencies", true),
				toggle("ganttAllowReorder", "Reorder rows", true),
				toggle("ganttAllowTaskCreate", "Create by drawing", true),
				{
					type: "dropdown",
					key: "ganttDependencyShift",
					displayName: "When predecessor moves",
					default: "none",
					options: {
						none: "Do not shift automatically",
						overlap: "Shift only when dates overlap",
						"maintain-gap": "Shift and maintain time between tasks",
					},
				},
				toggle("ganttWritePhaseDates", "Write phase dates", false),
			],
		},
		{
			type: "group",
			displayName: "Note template",
			items: [
				{
					type: "file",
					key: "ganttTemplatePath",
					displayName: "Template note",
					default: "",
					placeholder: "Templates/Note.md",
					filter: (file: TFile) => file.extension === "md",
				},
				{
					type: "folder",
					key: "ganttTargetFolder",
					displayName: "Target folder",
					default: "",
					placeholder: "Leave blank to follow Base",
				},
				{
					type: "text",
					key: "ganttTitleFormat",
					displayName: "Title format",
					default: "New note {{date}}",
					placeholder: "New note {{date}}",
				},
			],
		},
	];
}

export function ganttRequestedProperties(
	options: GanttOptions,
	visibleProperties: readonly BasesPropertyId[] = [],
): BasesPropertyId[] {
	return [
		...new Set(
			[
				options.start,
				options.end,
				options.label,
				options.parent,
				options.order,
				options.progress,
				options.colorBy,
				options.dependsOn,
				...visibleProperties,
			].filter((id): id is BasesPropertyId => id !== null),
		),
	];
}
