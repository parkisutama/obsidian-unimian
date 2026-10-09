// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesCalendarView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import { type App, type BasesView, Notice } from "obsidian";
import { NoteTemplateService } from "../../services/NoteTemplateService";
import type { NoteTemplateDefaults } from "../../types/settings";

interface EventNoteFields {
	dateStartField: string;
	dateEndField: string;
}

function toFrontmatterFieldName(propertyId: string): string {
	if (!propertyId || propertyId.startsWith("file.") || propertyId.startsWith("formula.")) return "";
	return propertyId.replace(/^note\./, "");
}

function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function formatLocalDateTime(date: Date): string {
	const tzOffset = date.getTimezoneOffset();
	const offsetHours = Math.abs(Math.floor(tzOffset / 60));
	const offsetMinutes = Math.abs(tzOffset % 60);
	const offsetSign = tzOffset <= 0 ? "+" : "-";
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");
	return `${formatLocalDate(date)}T${hours}:${minutes}:${seconds}${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;
}

function selectionFileName(start: Date): string {
	const hours = String(start.getHours()).padStart(2, "0");
	const minutes = String(start.getMinutes()).padStart(2, "0");
	return `Event ${formatLocalDate(start)} ${hours}.${minutes}`;
}

/** Create a Calendar event note through the shared template service. */
export async function createCalendarEventNote(
	app: App,
	view: BasesView,
	defaults: NoteTemplateDefaults,
	fields: EventNoteFields,
	start: Date,
	end: Date | null,
	allDay: boolean,
): Promise<void> {
	if (!fields.dateStartField) {
		new Notice("Configure a date start field before creating calendar events.");
		return;
	}
	if (fields.dateStartField.startsWith("formula.") || fields.dateEndField.startsWith("formula.")) {
		new Notice("Cannot create calendar events with formula date properties.");
		return;
	}

	const startFieldName = toFrontmatterFieldName(fields.dateStartField);
	const endFieldName = toFrontmatterFieldName(fields.dateEndField);
	if (!startFieldName) {
		new Notice("Configure a writable date start field before creating calendar events.");
		return;
	}

	const frontmatter: Record<string, unknown> = {
		[startFieldName]: allDay ? formatLocalDate(start) : formatLocalDateTime(start),
	};
	if (endFieldName && end) {
		frontmatter[endFieldName] = allDay ? formatLocalDate(end) : formatLocalDateTime(end);
	}

	await new NoteTemplateService(app, defaults).createNote(view, {
		title: selectionFileName(start),
		start,
		end,
		allDay,
		frontmatter,
	});
}
