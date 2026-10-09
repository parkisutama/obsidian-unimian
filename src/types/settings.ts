// SPDX-License-Identifier: GPL-3.0-only
// Portions adapted from Planner (https://github.com/SawyerRensel/Planner): src/types/settings.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

/**
 * Per-value style override for a property field.
 * User edits this directly in data.json:
 *
 * "valueStyles": {
 *   "note.status": {
 *     "Done": { "color": "#859900" }
 *   }
 * }
 *
 * For icons, use emojis directly in your property values (e.g. "✅ Done").
 */
export interface ValueStyle {
	/** Hex color string, e.g. "#268bd2" */
	color?: string;
}

/** Default field mappings for the Calendar view */
export interface CalendarDefaults {
	weekStartsOn: WeekDay;
	fontSize: number; // px value, range 6–18
	dateStartField: string;
	dateEndField: string;
	colorBy: string;
	defaultView: string;
}

/** Default field mappings for the Swimlane view */
export interface SwimlaneDefaults {
	plannerGroupBy: string;
	swimlaneBy: string;
	colorBy: string;
	dateStartField: string;
	dateEndField: string;
	columnWidth: number;
	borderStyle: string;
	badgePlacement: string;
	hideEmptyColumns: boolean;
	freezeHeaders: string;
	/** Whether to show the property name label inside generic badge chips */
	showPropertyLabels: boolean;
}

/**
 * Sticky Note's plugin-level pinned state (docs/specs/sticky-note.md §5.1). Never a note
 * property — exclusive to this view, scoped per `.base` file, keyed by note path.
 */
export interface StickyNoteData {
	pinnedByBase: Record<string, string[]>;
}

/** Shared note template settings used by views that create notes. */
export interface NoteTemplateDefaults {
	/** Template note path. Blank means create with Bases defaults only. */
	templatePath: string;
	/** Target folder override. Blank means let Bases choose the destination. */
	targetFolder: string;
	/** Base filename format for generated notes. */
	titleFormat: string;
}

/**
 * Unimian plugin settings. Property names are persisted API and remain stable.
 * Stored at: vault/.obsidian/plugins/unimian/data.json
 * Dates in YAML frontmatter use ISO 8601 (e.g. 2026-02-25T12:53:27+07:00).
 */
export interface UnimianSettings {
	// Per-view field defaults (used as fallback when not set in the .base file)
	calendarDefaults: CalendarDefaults;
	swimlaneDefaults: SwimlaneDefaults;

	/**
	 * Per-value style map: { fieldName: { value: { color? } } }
	 * fieldName matches the Bases property key (e.g. "note.status").
	 * Falls back to stringToColor when not specified.
	 * For icons, embed emojis directly in your property values.
	 */
	valueStyles: Record<string, Record<string, ValueStyle>>;

	/**
	 * When true, clicking a card/item in any view opens a read-only quick preview popup
	 * (rendered note content plus a backlinks panel) instead of jumping straight into a
	 * workspace pane. Holding a pane-destination modifier (Ctrl/Cmd for a new tab, etc.)
	 * always bypasses the popup and opens the file directly.
	 */
	openNotesInPreview: boolean;

	/** Sticky Note's pinned-note state — see `StickyNoteData`. */
	stickyNote: StickyNoteData;
}

/**
 * Days of the week for week start setting
 */
export type WeekDay =
	| "monday"
	| "tuesday"
	| "wednesday"
	| "thursday"
	| "friday"
	| "saturday"
	| "sunday";

/**
 * Default settings — also serves as documentation for data.json structure.
 */
export const DEFAULT_SETTINGS: UnimianSettings = {
	calendarDefaults: {
		weekStartsOn: "monday",
		fontSize: 10,
		dateStartField: "",
		dateEndField: "",
		colorBy: "",
		defaultView: "dayGridMonth",
	},

	swimlaneDefaults: {
		plannerGroupBy: "",
		swimlaneBy: "",
		colorBy: "",
		dateStartField: "",
		dateEndField: "",
		columnWidth: 280,
		borderStyle: "left-accent",
		badgePlacement: "properties-section",
		hideEmptyColumns: false,
		freezeHeaders: "none",
		showPropertyLabels: true,
	},

	openNotesInPreview: true,

	stickyNote: {
		pinnedByBase: {},
	},

	valueStyles: {
		"note.status": {
			Backlog: { color: "#6b7280" }, // grey   — gathering/unrefined
			"To Do": { color: "#268bd2" }, // blue   — ready to pick up
			"In Progress": { color: "#b58900" }, // amber  — actively being worked
			"In Review": { color: "#7c3aed" }, // purple — under review
			Blocked: { color: "#dc322f" }, // red    — blocked
			Done: { color: "#16a34a" }, // green  — completed
			Cancelled: { color: "#6b7280" }, // slate  — cancelled
			Archived: { color: "#9ca3af" }, // muted  — archived
		},
		"note.priority": {
			High: { color: "#dc322f" }, // red   — urgent
			Medium: { color: "#b58900" }, // amber — normal
			Low: { color: "#6b7280" }, // grey  — low urgency
		},
	},
};
