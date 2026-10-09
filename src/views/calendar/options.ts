// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesCalendarView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import type { BasesAllOptions, BasesPropertyId, TFile } from "obsidian";
import type UnimianPlugin from "../../main";
import { PropertyTypeService } from "../../services/PropertyTypeService";
import { createPeriodicOptions } from "./periodic/options";

/** The Bases options schema for the Calendar view. Keys are persisted in `.base` files. */
export function createCalendarOptions(plugin: UnimianPlugin): BasesAllOptions[] {
	return [
		{
			type: "dropdown",
			key: "weekStartsOn",
			displayName: "Week starts on",
			default: "monday",
			options: {
				monday: "Monday",
				tuesday: "Tuesday",
				wednesday: "Wednesday",
				thursday: "Thursday",
				friday: "Friday",
				saturday: "Saturday",
				sunday: "Sunday",
			},
		},
		{
			type: "slider",
			key: "fontSize",
			displayName: "Font size",
			min: 6,
			max: 18,
			step: 1,
			default: 10,
		},
		{
			type: "dropdown",
			key: "defaultView",
			displayName: "Default view",
			default: "dayGridMonth",
			options: {
				multiMonthYear: "Year",
				dayGridMonth: "Month",
				timeGridWeek: "Week",
				timeGridDay: "Day",
				listWeek: "List",
			},
		},
		{
			type: "property",
			key: "colorBy",
			displayName: "Color by",
			default: "",
			placeholder: "Select property",
			filter: (propId: BasesPropertyId) =>
				PropertyTypeService.isCategoricalProperty(propId, plugin.app),
		},
		{
			type: "property",
			key: "titleField",
			displayName: "Title field",
			default: "",
			placeholder: "File name",
			filter: (propId: BasesPropertyId) => PropertyTypeService.isTextProperty(propId, plugin.app),
		},
		{
			type: "property",
			key: "dateStartField",
			displayName: "Date start field",
			default: "",
			placeholder: "Select property",
			filter: (propId: BasesPropertyId) => PropertyTypeService.isDateProperty(propId, plugin.app),
		},
		{
			type: "property",
			key: "dateEndField",
			displayName: "Date end field",
			default: "",
			placeholder: "Select property",
			filter: (propId: BasesPropertyId) => PropertyTypeService.isDateProperty(propId, plugin.app),
		},
		{
			type: "property",
			key: "allDayField",
			displayName: "All-day field",
			default: "",
			placeholder: "None (use start time)",
		},
		{
			type: "group",
			displayName: "Note template",
			items: [
				{
					type: "file",
					key: "templatePath",
					displayName: "Template note",
					default: "",
					placeholder: "Templates/Event.md",
					filter: (file: TFile) => file.extension === "md",
				},
				{
					type: "folder",
					key: "targetFolder",
					displayName: "Target folder",
					default: "",
					placeholder: "Leave blank to follow Base",
				},
				{
					type: "text",
					key: "titleFormat",
					displayName: "Title format",
					default: "Event {{date}} {{time}}",
					placeholder: "Event {{date}} {{time}}",
				},
			],
		},
		{
			type: "slider",
			key: "yearContinuousRowHeight",
			displayName: "Year view (continuous) row height",
			min: 40,
			max: 150,
			step: 10,
			default: 60,
		},
		{
			type: "slider",
			key: "yearSplitRowHeight",
			displayName: "Year view (split) row height",
			min: 40,
			max: 150,
			step: 10,
			default: 60,
		},
		...createPeriodicOptions(),
	];
}
