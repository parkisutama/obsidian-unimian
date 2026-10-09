// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

// PERF-001: a shared ~5,000-entry Base fixture, reused across Swimlane, Calendar, Gantt, and
// Timeline's bounded-initial-render tests (docs/specs/performance.md §2.1). 5,000 entries matches
// this project's established large-Base precedent (see GBETA-016's 2,000-task Gantt fixture,
// scaled up here since Gantt's own scale test already covers its own mapping cost separately).

import type { EntrySnapshot } from "../../src/core/entries/EntrySnapshot";
import type { NormalizedValue } from "../../src/core/entries/NormalizedValue";
import type { NoteFixture as CalendarNoteFixture } from "./calendar";
import type { NoteFixture as SwimlaneNoteFixture } from "./swimlane";

export const LARGE_BASE_SIZE = 5000;

const STATUSES = ["Todo", "Doing", "Done"] as const;
const PRIORITIES = ["Low", "Medium", "High"] as const;

const pad = (n: number): string => String(n).padStart(2, "0");

/** A day offset from a fixed epoch, formatted as `YYYY-MM-DD` (deterministic across test runs). */
function isoDay(offsetDays: number): string {
	const d = new Date(Date.UTC(2026, 0, 1 + offsetDays));
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Notes for the Swimlane harness: spread across status columns and priority swimlanes. */
export function largeSwimlaneNotes(count = LARGE_BASE_SIZE): SwimlaneNoteFixture[] {
	return Array.from({ length: count }, (_, i) => ({
		path: `Tasks/${i}.md`,
		title: `Task ${i}`,
		status: STATUSES[i % STATUSES.length]!,
		priority: PRIORITIES[i % PRIORITIES.length]!,
	}));
}

/** Notes for the Calendar harness: spread across a multi-year date range so month/year views
 *  see many events per day once the count gets large, exercising FullCalendar's own event limits. */
export function largeCalendarNotes(count = LARGE_BASE_SIZE): CalendarNoteFixture[] {
	return Array.from({ length: count }, (_, i) => ({
		path: `Events/${i}.md`,
		title: `Event ${i}`,
		date_start: isoDay(i % 720),
		date_end: isoDay((i % 720) + 1),
		status: STATUSES[i % STATUSES.length]!,
	}));
}

/** Raw EntrySnapshot entries, for views that consume EntrySnapshot[] directly (Timeline). */
export function largeEntrySnapshots(count = LARGE_BASE_SIZE): EntrySnapshot[] {
	return Array.from({ length: count }, (_, i) => {
		const values = new Map<string, NormalizedValue>([
			["note.start", { kind: "date", value: isoDay(i % 720), hasTime: false }],
			["note.end", { kind: "date", value: isoDay((i % 720) + 3), hasTime: false }],
			["note.title", { kind: "text", value: `Item ${i}` }],
		]);
		return {
			path: `Items/${i}.md`,
			basename: `${i}`,
			extension: "md",
			folder: "Items",
			ctime: 1,
			mtime: 2,
			values,
		};
	});
}

/** Gantt tasks matching `@jaeungkim/gantt-chart`'s `Task` shape, flat (no phases/dependencies). */
export interface LargeGanttTask {
	id: string;
	name: string;
	startDate: string;
	endDate: string;
	parentId: string | null;
	sequence: string;
	progress: number;
}

export function largeGanttTasks(count = LARGE_BASE_SIZE): LargeGanttTask[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `T${i}`,
		name: `Task ${i}`,
		startDate: new Date(Date.UTC(2026, 0, 1 + (i % 720))).toISOString(),
		endDate: new Date(Date.UTC(2026, 0, 5 + (i % 720))).toISOString(),
		parentId: null,
		sequence: String(i + 1),
		progress: (i * 7) % 101,
	}));
}
