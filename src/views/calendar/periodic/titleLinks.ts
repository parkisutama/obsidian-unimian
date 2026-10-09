// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { PERIODIC_KINDS, type PeriodicConfig } from "./config";
import { formatPeriodicTokens, type PeriodicKind, weekInfo } from "./resolver";
import { weekAnchor } from "./weekLinks";

export interface TitleLinkHooks {
	/** Path of the period's note when it exists, for the dot and hover preview. */
	existingPath(date: Date, kind: PeriodicKind): string | null;
	open(date: Date, kind: PeriodicKind): void;
	preview(event: MouseEvent, path: string, target: HTMLElement): void;
}

interface Segment {
	text: string;
	kind?: PeriodicKind;
}

interface TitleView {
	type: string;
	title: string;
	currentStart: Date;
}

const SEPARATOR: Segment = { text: " · " };

/** Whether the title needs custom rendering: only when some period is configured. */
export function hasTitleLinks(config: PeriodicConfig): boolean {
	return PERIODIC_KINDS.some((kind) => config.periods[kind].pattern !== "");
}

/** Whether any day or week link exists to make interactive (title parts render their own links). */
export function hasPeriodLinks(config: PeriodicConfig): boolean {
	return config.periods.day.pattern !== "" || config.periods.week.pattern !== "";
}

const addDays = (date: Date, days: number): Date =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** `September 2026 (Q3)`, each of month, year, and quarter its own link target. */
function monthYearQuarter(): Segment[] {
	return [
		{ text: "{MMMM}", kind: "month" },
		{ text: " " },
		{ text: "{YYYY}", kind: "year" },
		{ text: " (" },
		{ text: "{Q}", kind: "quarter" },
		{ text: ")" },
	];
}

/**
 * The title's parts for the visible range, plus the date every part is resolved from. Month and
 * year views link the periods they show; week, 3-day, and day views lead with the week (and the
 * day) and follow with the month, year, and quarter of the range's middle. List views keep
 * FullCalendar's own title.
 */
function layout(view: TitleView): { segments: Segment[]; anchor: Date } {
	const start = view.currentStart;
	switch (view.type) {
		case "dayGridMonth":
			return { segments: monthYearQuarter(), anchor: start };
		case "multiMonthYear":
		case "dayGridYear":
			return { segments: [{ text: "{YYYY}", kind: "year" }], anchor: start };
		case "timeGridWeek":
			return {
				segments: [{ text: "{W}", kind: "week" }, SEPARATOR, ...monthYearQuarter()],
				anchor: weekAnchor(start),
			};
		case "timeGridThreeDay":
			return {
				segments: [{ text: "{W}", kind: "week" }, SEPARATOR, ...monthYearQuarter()],
				anchor: addDays(start, 1),
			};
		case "timeGridDay":
			return {
				segments: [
					{ text: "{ddd D}", kind: "day" },
					SEPARATOR,
					{ text: "{W}", kind: "week" },
					SEPARATOR,
					...monthYearQuarter(),
				],
				anchor: start,
			};
		default:
			return { segments: [{ text: view.title }], anchor: start };
	}
}

function label(segment: Segment, anchor: Date, config: PeriodicConfig): string {
	switch (segment.text) {
		case "{MMMM}":
			return formatPeriodicTokens("MMMM", anchor);
		case "{YYYY}":
			return formatPeriodicTokens("YYYY", anchor);
		case "{Q}":
			return `Q${formatPeriodicTokens("Q", anchor)}`;
		case "{W}":
			return `W${weekInfo(anchor, config.weekRule).week}`;
		case "{ddd D}":
			return formatPeriodicTokens("ddd D", anchor);
		default:
			return segment.text;
	}
}

/**
 * Rewrites the title element for the visible range. A part is a link (underlined, with a dot when
 * its note exists) only when its period is configured; everything else is plain text. When no part
 * would be a link, FullCalendar's own title is shown unchanged.
 */
export function renderTitleLinks(
	el: HTMLElement,
	view: TitleView,
	config: PeriodicConfig,
	hooks: TitleLinkHooks,
): void {
	el.empty();
	let { segments, anchor } = layout(view);
	const linked = (segment: Segment) =>
		!!segment.kind && config.periods[segment.kind].pattern !== "";
	if (!segments.some(linked)) {
		segments = [{ text: view.title }];
		anchor = view.currentStart;
	}

	for (const segment of segments) {
		const text = label(segment, anchor, config);
		const kind = segment.kind;
		if (!kind || !linked(segment)) {
			el.createSpan({ text });
			continue;
		}

		const link = el.createSpan({
			cls: "planner-fc-title-link",
			text,
			attr: { role: "link", tabindex: "0" },
		});
		const open = () => hooks.open(anchor, kind);
		link.addEventListener("click", open);
		link.addEventListener("keydown", (event) => {
			if (event.key === "Enter") open();
		});

		const path = hooks.existingPath(anchor, kind);
		if (path) {
			link.createSpan({ cls: "planner-journal-dot planner-title-dot" });
			link.addEventListener("mouseenter", (event) => hooks.preview(event, path, link));
		}
	}
}
