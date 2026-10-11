// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesKanbanView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import type { App, BasesAllOptions, BasesPropertyId } from "obsidian";
import { PropertyTypeService } from "../../services/PropertyTypeService";

/** The Bases options schema for the Swimlane view. Keys are persisted in `.base` files. */
export function createSwimlaneOptions(app: App): BasesAllOptions[] {
	return [
		{
			type: "property",
			key: "plannerGroupBy",
			displayName: "Columns by",
			default: "",
			placeholder: "Select property",
			filter: (propId: BasesPropertyId) => PropertyTypeService.isCategoricalProperty(propId, app),
		},
		{
			type: "property",
			key: "swimlaneBy",
			displayName: "Swimlanes by",
			default: "",
			placeholder: "None",
			filter: (propId: BasesPropertyId) => PropertyTypeService.isCategoricalProperty(propId, app),
		},
		{
			type: "property",
			key: "colorBy",
			displayName: "Color by",
			default: "",
			placeholder: "None",
			filter: (propId: BasesPropertyId) => PropertyTypeService.isCategoricalProperty(propId, app),
		},
		{
			type: "property",
			key: "titleBy",
			displayName: "Title by",
			default: "",
			placeholder: "File name",
			filter: (propId: BasesPropertyId) => PropertyTypeService.isTextProperty(propId, app),
		},
		{
			type: "dropdown",
			key: "borderStyle",
			displayName: "Border style",
			default: "left-accent",
			options: {
				none: "None",
				"left-accent": "Left accent",
				"full-border": "Full border",
			},
		},
		{
			type: "property",
			key: "coverField",
			displayName: "Cover field",
			default: "",
			placeholder: "None",
			filter: (propId: BasesPropertyId) => PropertyTypeService.isTextProperty(propId, app),
		},
		{
			type: "dropdown",
			key: "coverDisplay",
			displayName: "Cover display",
			default: "banner",
			options: {
				none: "None",
				banner: "Banner (top)",
				"thumbnail-left": "Thumbnail (left)",
				"thumbnail-right": "Thumbnail (right)",
				background: "Background",
			},
		},
		{
			type: "dropdown",
			key: "coverHeight",
			displayName: "Cover height (banner)",
			default: "100",
			options: {
				"60": "Extra small (60px)",
				"80": "Small (80px)",
				"100": "Medium-small (100px)",
				"120": "Medium (120px)",
				"150": "Medium-large (150px)",
				"180": "Large (180px)",
				"200": "Extra large (200px)",
			},
		},
		{
			type: "property",
			key: "summaryField",
			displayName: "Summary field",
			default: "",
			placeholder: "None",
		},
		{
			type: "property",
			key: "dateStartField",
			displayName: "Date start field",
			default: "",
			placeholder: "Select property",
			filter: (propId: BasesPropertyId) => PropertyTypeService.isDateProperty(propId, app),
		},
		{
			type: "property",
			key: "dateEndField",
			displayName: "Date end field",
			default: "",
			placeholder: "Select property",
			filter: (propId: BasesPropertyId) => PropertyTypeService.isDateProperty(propId, app),
		},
		{
			type: "dropdown",
			key: "dateFormat",
			displayName: "Date format",
			default: "date-short",
			options: {
				"date-short": "Short (Jan 15)",
				"date-medium": "Medium (Jan 15, 2026)",
				"date-long": "Long (January 15, 2026)",
				"date-numeric": "Numeric (1/15/2026)",
				"datetime-short": "Date + time (Jan 15 10:30)",
				"datetime-medium": "Date + time, year (Jan 15, 2026 10:30)",
				relative: "Relative (2d ago / in 3d)",
			},
		},
		{
			type: "dropdown",
			key: "badgePlacement",
			displayName: "Badge placement",
			default: "properties-section",
			options: {
				inline: "Inline",
				"properties-section": "Properties section",
			},
		},
		{
			type: "dropdown",
			key: "columnWidth",
			displayName: "Column width",
			default: "280",
			options: {
				"200": "Narrow (200px)",
				"240": "Medium-narrow (240px)",
				"280": "Medium (280px)",
				"320": "Medium-wide (320px)",
				"360": "Wide (360px)",
				"400": "Extra wide (400px)",
			},
		},
		{
			type: "dropdown",
			key: "hideEmptyColumns",
			displayName: "Hide empty columns",
			default: "false",
			options: {
				false: "No",
				true: "Yes",
			},
		},
		{
			type: "dropdown",
			key: "freezeHeaders",
			displayName: "Freeze headers",
			default: "both",
			options: {
				off: "Off",
				columns: "Columns",
				swimlanes: "Swimlanes",
				both: "Both",
			},
		},
		{
			type: "dropdown",
			key: "swimHeaderDisplay",
			displayName: "Swimlane header display",
			default: "vertical",
			options: {
				horizontal: "Horizontal",
				vertical: "Vertical",
			},
		},
		{
			type: "dropdown",
			key: "showPropertyLabels",
			displayName: "Show property labels in badges",
			default: "true",
			options: {
				true: "Show",
				false: "Hide",
			},
		},
	];
}
