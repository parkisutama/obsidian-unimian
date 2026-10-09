// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { afterEach, describe, expect, it, vi } from "vitest";
import type UnimianPlugin from "../src/main";
import { NoteTemplateService } from "../src/services/NoteTemplateService";
import { DEFAULT_SETTINGS } from "../src/types/settings";
import { createCalendarViewRegistration } from "../src/views/BasesCalendarView";
import { entryToEvent } from "../src/views/calendar/eventMapping";
import { createCalendarEventNote } from "../src/views/calendar/eventNote";
import { formatPeriodicTokens } from "../src/views/calendar/periodic/resolver";
import { type CalendarHarness, createCalendarHarness, dayOffset } from "./fixtures/calendar";

let harness: CalendarHarness | null = null;
const mount = (...args: Parameters<typeof createCalendarHarness>) => {
	harness = createCalendarHarness(...args);
	return harness;
};

afterEach(() => {
	harness?.destroy();
	harness = null;
});

// The view keeps FullCalendar private; tests drive it through the same API the toolbar uses.
type ViewInternals = {
	calendar: {
		view: { type: string };
		changeView(view: string): void;
		getEvents(): Array<{
			title: string;
			allDay: boolean;
			color: string;
			contrastColor: string;
			extendedProps: Record<string, unknown>;
		}>;
	};
	handleEventDrop(info: unknown): Promise<void>;
	handleEventResize(info: unknown): Promise<void>;
	deleteEventNote(entry: { file: { path: string; basename: string } }): Promise<void>;
};
const internals = (h: CalendarHarness) => h.view as unknown as ViewInternals;

const q = <T extends Element = HTMLElement>(h: CalendarHarness, selector: string) =>
	h.host.querySelector<T & Element>(selector);
const button = (h: CalendarHarness, name: string) => {
	const el = q<HTMLButtonElement>(h, `.planner-fc-button-${name}`);
	if (!el) throw new Error(`toolbar button ${name} not rendered`);
	return el;
};
const activeButtons = (h: CalendarHarness) =>
	[
		...h.host.querySelectorAll(
			".planner-fc-button.is-active, .planner-fc-button[data-planner-active]",
		),
	].map((el) => el.className.match(/planner-fc-button-(\w+)/)?.[1]);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Calendar extracted behavior", () => {
	it("maps the configured date, title, and color fields into a FullCalendar event", () => {
		const entry = {
			file: {
				path: "Projects/Launch.md",
				basename: "Launch",
				parent: { path: "Projects", name: "Projects" },
			},
			getValue: (id: string) =>
				({
					"note.date_start": "2026-09-19T10:00:00",
					"note.date_end": "2026-09-19T12:00:00",
					"note.title": "Launch review",
					"note.status": "active",
				})[id] ?? null,
		};

		expect(
			entryToEvent(entry as never, {
				dateStartField: "note.date_start",
				dateEndField: "note.date_end",
				titleField: "note.title",
				allDayField: null,
				colorByProp: "note.status",
				valueStyleColor: () => "#123456",
				resolvePrettyPropertiesColor: () => null,
			}),
		).toMatchObject({
			title: "Launch review",
			start: "2026-09-19T10:00:00",
			end: "2026-09-19T12:00:00",
			allDay: false,
			color: "#123456",
			extendedProps: { path: "Projects/Launch.md" },
		});
	});

	it("routes event-note creation through NoteTemplateService with configured fields", async () => {
		const createNote = vi.spyOn(NoteTemplateService.prototype, "createNote").mockResolvedValue();
		const start = new Date(2026, 8, 19, 10, 30);
		const end = new Date(2026, 8, 19, 11, 30);
		const view = {} as never;
		await createCalendarEventNote(
			{} as never,
			view,
			{ templatePath: "", targetFolder: "", titleFormat: "Event {{date}} {{time}}" },
			{ dateStartField: "note.date_start", dateEndField: "note.date_end" },
			start,
			end,
			false,
		);

		expect(createNote).toHaveBeenCalledWith(
			view,
			expect.objectContaining({
				title: "Event 2026-09-19 10.30",
				start,
				end,
				allDay: false,
				frontmatter: {
					date_start: expect.stringMatching(/^2026-09-19T10:30:00[+-]\d{2}:\d{2}$/),
					date_end: expect.stringMatching(/^2026-09-19T11:30:00[+-]\d{2}:\d{2}$/),
				},
			}),
		);
		createNote.mockRestore();
	});
});

describe("BasesCalendarView toolbar", () => {
	it("renders the configured default view with its button active", () => {
		const h = mount({ config: { defaultView: "timeGridWeek" } });
		expect(internals(h).calendar.view.type).toBe("timeGridWeek");
		expect(activeButtons(h)).toEqual(["timeGridWeek"]);
	});

	it("switches views from the toolbar and tracks the active button", async () => {
		const h = mount();
		for (const view of [
			"timeGridWeek",
			"timeGridThreeDay",
			"timeGridDay",
			"listWeek",
			"dayGridMonth",
		]) {
			button(h, view).click();
			await flush();
			expect(internals(h).calendar.view.type).toBe(view);
			expect(activeButtons(h)).toEqual([view]);
		}
	});

	it("sets Obsidian icons on the icon-only buttons", () => {
		const h = mount();
		expect(button(h, "todayButton").querySelector("svg")?.dataset.icon).toBe(
			"square-split-horizontal",
		);
		expect(button(h, "refreshButton").querySelector("svg")?.dataset.icon).toBe("refresh-ccw");
	});
});

describe("BasesCalendarView year views", () => {
	it("enables the year toggle only in year views", async () => {
		const h = mount();
		const toggle = button(h, "yearToggleButton");
		expect(toggle.dataset.plannerDisabled).toBe("true");
		expect(toggle.getAttribute("aria-disabled")).toBe("true");

		button(h, "yearButton").click();
		await flush();
		expect(internals(h).calendar.view.type).toBe("multiMonthYear");
		expect(activeButtons(h)).toEqual(["yearButton"]);
		expect(toggle.dataset.plannerDisabled).toBeUndefined();
		expect(toggle.querySelector("svg")?.dataset.icon).toBe("layout-grid");
	});

	it("toggles between split and continuous year views", async () => {
		const h = mount({ config: { defaultView: "multiMonthYear" } });
		const toggle = button(h, "yearToggleButton");

		toggle.click();
		await flush();
		expect(internals(h).calendar.view.type).toBe("dayGridYear");
		expect(toggle.querySelector("svg")?.dataset.icon).toBe("align-justify");
		expect(activeButtons(h)).toEqual(["yearButton"]);

		toggle.click();
		await flush();
		expect(internals(h).calendar.view.type).toBe("multiMonthYear");
	});

	it("ignores the year toggle outside year views", async () => {
		const h = mount();
		internals(h).calendar.changeView("timeGridWeek");
		await flush();
		button(h, "yearToggleButton").click();
		await flush();
		expect(internals(h).calendar.view.type).toBe("timeGridWeek");
	});

	it("marks year view rows so the configured row heights apply", async () => {
		const h = mount({
			config: { defaultView: "dayGridYear", yearContinuousRowHeight: 120, yearSplitRowHeight: 80 },
		});
		expect(q(h, ".planner-fc-view-dayGridYear .planner-fc-row")).not.toBeNull();
		const container = q(h, ".planner-calendar-container");
		expect(container?.style.getPropertyValue("--planner-year-continuous-row-height")).toBe("120px");
		expect(container?.style.getPropertyValue("--planner-year-split-row-height")).toBe("80px");
	});
});

describe("BasesCalendarView day cells and daily notes", () => {
	const today = dayOffset(0);
	const inThreeDays = dayOffset(3);
	const daily = { periodicDayPath: "YYYY-MM-DD" };

	it("adds stable classes for today's day number and header", () => {
		const h = mount();
		expect(q(h, `[data-date="${today}"] .planner-fc-day-number.is-today`)).not.toBeNull();
		expect(q(h, ".planner-fc-title")?.textContent).not.toBe("");
		expect(q(h, ".planner-fc-toolbar")).not.toBeNull();
	});

	it("shows a journal dot only for days with an existing daily note", () => {
		const h = mount({ config: daily, existingFiles: [`${inThreeDays}.md`] });
		const withNote = q(h, `[data-date="${inThreeDays}"]`);
		expect(withNote?.querySelector(".planner-journal-dot")).not.toBeNull();
		expect(q(h, `[data-date="${today}"] .planner-journal-dot`)).toBeNull();
	});

	it("has no day links, dots, or note creation when no period is configured", async () => {
		const h = mount({ existingFiles: [`${today}.md`, `${inThreeDays}.md`] });
		expect(h.host.querySelectorAll(".planner-journal-dot")).toHaveLength(0);
		const number = q(h, `[data-date="${today}"] .planner-fc-day-number`);
		number?.dispatchEvent(new MouseEvent("mouseenter"));
		number?.click();
		await flush();
		expect(h.hovered).toEqual([]);
		expect(h.opened).toEqual([]);
	});

	it("previews and opens the daily note from the day number", async () => {
		const h = mount({ config: daily, existingFiles: [`${today}.md`] });
		const number = q(h, `[data-date="${today}"] .planner-fc-day-number`);
		expect(number).not.toBeNull();
		number?.dispatchEvent(new MouseEvent("mouseenter"));
		number?.click();
		await flush();
		expect(h.hovered).toContain(`${today}.md`);
		expect(h.opened).toContain(`${today}.md`);
	});

	it("previews the daily note from week and list day headers", async () => {
		const h = mount({
			config: { ...daily, defaultView: "timeGridWeek" },
			existingFiles: [`${today}.md`],
		});
		q(h, ".planner-fc-day-header.is-today")?.dispatchEvent(new MouseEvent("mouseenter"));
		expect(h.hovered).toEqual([`${today}.md`]);

		internals(h).calendar.changeView("listWeek");
		await flush();
		const listHeaders = h.host.querySelectorAll(".planner-fc-list-day-text.is-today");
		expect(listHeaders.length).toBeGreaterThan(0);
		listHeaders[0]?.dispatchEvent(new MouseEvent("mouseenter"));
		expect(h.hovered).toEqual([`${today}.md`, `${today}.md`]);
	});
});

describe("BasesCalendarView property defaults", () => {
	const registrationOptions = () => {
		const plugin = {
			app: {},
			settings: structuredClone(DEFAULT_SETTINGS),
		} as unknown as UnimianPlugin;
		return createCalendarViewRegistration(plugin).options?.({} as never) ?? [];
	};

	it("does not preselect any property in its options", () => {
		const preselected = registrationOptions()
			.filter((option) => option.type === "property" && "default" in option && option.default)
			.map((option) => ("key" in option ? option.key : ""));
		expect(preselected).toEqual([]);
	});

	it("offers an all-day property option instead of reading note.all_day", () => {
		const allDay = registrationOptions().find(
			(option) => "key" in option && option.key === "allDayField",
		);
		expect(allDay).toMatchObject({ type: "property", default: "" });
	});

	it("uses the file name as event title when Title field is unset", () => {
		const h = mount({ config: { titleField: undefined } });
		expect(
			internals(h)
				.calendar.getEvents()
				.map((e) => e.title)
				.sort(),
		).toEqual(["Launch", "Offsite", "Report"]);
	});

	const allDayNote = {
		path: "Standup.md",
		title: "Standup",
		date_start: dayOffset(0, 9),
		date_end: dayOffset(0, 10),
		all_day: "true",
	};

	it("decides all-day from the start time when no all-day property is set", () => {
		const h = mount({ notes: [allDayNote] });
		expect(internals(h).calendar.getEvents()[0]?.allDay).toBe(false);
	});

	it("uses the configured all-day property", () => {
		const h = mount({ notes: [allDayNote], config: { allDayField: "note.all_day" } });
		expect(internals(h).calendar.getEvents()[0]?.allDay).toBe(true);
	});
});

describe("BasesCalendarView events", () => {
	it("maps notes to events with a color from the color-by property", () => {
		const h = mount();
		const events = internals(h).calendar.getEvents();
		expect(events.map((e) => e.title).sort()).toEqual([
			"Launch review",
			"Quarterly report",
			"Team offsite",
		]);
		for (const event of events) {
			expect(event.color).toMatch(/^#[0-9a-f]{6}$/i);
			expect(event.contrastColor).toMatch(/^#(000000|ffffff)$/);
		}
		// Notes with different color-by values get different colors.
		const colorOf = (title: string) => events.find((e) => e.title === title)?.color;
		expect(colorOf("Launch review")).not.toBe(colorOf("Team offsite"));
		expect(h.host.querySelectorAll(".planner-fc-event").length).toBeGreaterThan(0);
	});

	it("writes moved dates back to the configured frontmatter fields", async () => {
		const h = mount();
		const path = internals(h)
			.calendar.getEvents()
			.find((e) => e.title === "Quarterly report")?.extendedProps.path;
		let reverted = false;
		await internals(h).handleEventDrop({
			event: {
				start: new Date(2026, 8, 23, 14),
				end: new Date(2026, 8, 23, 15),
				extendedProps: { path },
			},
			revert: () => {
				reverted = true;
			},
		});
		expect(reverted).toBe(false);
		expect(h.frontmatter).toHaveLength(1);
		expect(h.frontmatter[0]?.path).toBe("Projects/Report.md");
		expect(h.frontmatter[0]?.values.date_start).toMatch(/^2026-09-23T14:00:00[+-]\d{2}:\d{2}$/);
		expect(h.frontmatter[0]?.values.date_end).toMatch(/^2026-09-23T15:00:00[+-]\d{2}:\d{2}$/);
	});

	it("writes resized end times back to frontmatter", async () => {
		const h = mount();
		const path = internals(h)
			.calendar.getEvents()
			.find((e) => e.title === "Launch review")?.extendedProps.path;
		await internals(h).handleEventResize({
			event: {
				start: new Date(2026, 8, 18, 10),
				end: new Date(2026, 8, 18, 13),
				extendedProps: { path },
			},
			revert: () => {},
		});
		expect(h.frontmatter[0]?.values.date_end).toMatch(/^2026-09-18T13:00:00/);
	});

	it("reverts drops when the date fields are formulas", async () => {
		const h = mount({
			config: { dateStartField: "formula.start", dateEndField: "formula.end" },
			notes: [{ path: "Formula.md", title: "Computed", start: dayOffset(0), end: dayOffset(1) }],
		});
		const path = internals(h).calendar.getEvents()[0]?.extendedProps.path;
		let reverted = false;
		await internals(h).handleEventDrop({
			event: { start: new Date(), end: new Date(), extendedProps: { path } },
			revert: () => {
				reverted = true;
			},
		});
		expect(reverted).toBe(true);
		expect(h.frontmatter).toHaveLength(0);
	});

	it("carries only a path in extendedProps, never a live BasesEntry (spec §7.5)", () => {
		const h = mount();
		const event = internals(h).calendar.getEvents()[0];
		expect(event?.extendedProps.path).toBeTypeOf("string");
		expect(event?.extendedProps).not.toHaveProperty("entry");
	});

	it("trashes the note through the legacy mutation gateway when deleted", async () => {
		const h = mount();
		await internals(h).deleteEventNote({
			file: { path: "Projects/Launch.md", basename: "Launch" },
		});
		expect(h.trashed).toEqual(["Projects/Launch.md"]);
	});
});

describe("BasesCalendarView lifecycle", () => {
	it("leaves no calendar or shared container class alive after repeated update/unload", async () => {
		const h = mount();
		internals(h).calendar.changeView("timeGridWeek");
		await flush();
		internals(h).calendar.changeView("dayGridMonth");
		await flush();

		expect(h.host.classList.contains("planner-bases-calendar")).toBe(true);
		expect(h.host.querySelector(".planner-fc-toolbar")).not.toBeNull();
		h.view.onunload();
		expect(h.host.classList.contains("planner-bases-calendar")).toBe(false);
		expect(h.host.querySelector(".planner-fc-toolbar")).toBeNull();
	});

	it("is safe to unload twice", () => {
		const h = mount();
		expect(() => {
			h.view.onunload();
			h.view.onunload();
		}).not.toThrow();
	});
});

describe("BasesCalendarView periodic day notes", () => {
	const today = dayOffset(0);
	const inThreeDays = dayOffset(3);
	const config = { periodicDayPath: "journal/YYYY-MM-DD" };

	it("marks and previews days from the configured pattern, not from root-level notes", async () => {
		const h = mount({ config, existingFiles: [`journal/${inThreeDays}.md`, `${today}.md`] });
		expect(
			q(h, `[data-date="${inThreeDays}"]`)?.querySelector(".planner-journal-dot"),
		).not.toBeNull();
		expect(q(h, `[data-date="${today}"] .planner-journal-dot`)).toBeNull();

		const number = q(h, `[data-date="${inThreeDays}"] .planner-fc-day-number`);
		number?.dispatchEvent(new MouseEvent("mouseenter"));
		number?.click();
		await flush();
		expect(h.hovered).toContain(`journal/${inThreeDays}.md`);
		expect(h.opened).toContain(`journal/${inThreeDays}.md`);
	});
});

describe("BasesCalendarView week-number links", () => {
	const week = { periodicWeekPath: "journal/GGGG-[W]WW" };
	const isoWeekOfToday = () => formatPeriodicTokens("GGGG-[W]WW", new Date());
	const cells = (h: CalendarHarness) => [
		...h.host.querySelectorAll<HTMLElement>(".planner-fc-week-number"),
	];

	it("shows no week numbers until weekly notes are configured", () => {
		const h = mount();
		expect(cells(h)).toHaveLength(0);
	});

	it("labels each row with its ISO week number", () => {
		const h = mount({ config: week });
		const labels = cells(h).map((el) => el.textContent?.trim());
		expect(labels.length).toBeGreaterThanOrEqual(4);
		// Rows are consecutive weeks, so the numbers rise by one (or wrap at year end).
		expect(labels.every((label) => /^\d{1,2}$/.test(label ?? ""))).toBe(true);
		const thisWeek = Number(isoWeekOfToday().split("W")[1]);
		expect(labels).toContain(String(thisWeek));
	});

	it("marks and opens only the weeks whose note exists", async () => {
		const h = mount({ config: week, existingFiles: [`journal/${isoWeekOfToday()}.md`] });
		const dots = h.host.querySelectorAll(".planner-fc-week-number .planner-week-dot");
		expect(dots).toHaveLength(1);

		const cell = dots[0]?.closest<HTMLElement>(".planner-fc-week-number");
		cell?.dispatchEvent(new MouseEvent("mouseenter"));
		cell?.click();
		await flush();
		expect(h.hovered).toContain(`journal/${isoWeekOfToday()}.md`);
		expect(h.opened).toContain(`journal/${isoWeekOfToday()}.md`);
	});
});

describe("BasesCalendarView title links", () => {
	const all = {
		periodicMonthPath: "j/YYYY-MM",
		periodicQuarterPath: "j/YYYY-[Q]Q",
		periodicYearPath: "j/YYYY",
	};
	const now = () => new Date();
	const title = (h: CalendarHarness) => q(h, ".planner-fc-title");
	const links = (h: CalendarHarness) => [
		...h.host.querySelectorAll<HTMLElement>(".planner-fc-title-link"),
	];
	const monthTitle = (date: Date) =>
		`${formatPeriodicTokens("MMMM YYYY", date)} (Q${formatPeriodicTokens("Q", date)})`;

	it("keeps FullCalendar's title, unlinked, while no title period is configured", () => {
		const h = mount();
		expect(links(h)).toHaveLength(0);
		expect(title(h)?.textContent).not.toBe("");
	});

	it("reads Month YYYY (Qn) with a link for each configured part", () => {
		const h = mount({ config: all });
		expect(title(h)?.textContent?.replace(/\s+/g, " ").trim()).toBe(monthTitle(now()));
		expect(links(h).map((el) => el.textContent)).toEqual([
			formatPeriodicTokens("MMMM", now()),
			formatPeriodicTokens("YYYY", now()),
			`Q${formatPeriodicTokens("Q", now())}`,
		]);
	});

	it("links only the configured periods and leaves the rest plain", () => {
		const h = mount({ config: { periodicYearPath: "j/YYYY" } });
		expect(links(h).map((el) => el.textContent)).toEqual([formatPeriodicTokens("YYYY", now())]);
		expect(title(h)?.textContent?.replace(/\s+/g, " ").trim()).toBe(monthTitle(now()));
	});

	it("marks a part whose note exists, and opens it on click", async () => {
		const h = mount({
			config: all,
			existingFiles: [`j/${formatPeriodicTokens("YYYY-MM", now())}.md`],
		});
		const [month, year] = links(h);
		expect(month?.querySelector(".planner-title-dot")).not.toBeNull();
		expect(year?.querySelector(".planner-title-dot")).toBeNull();
		month?.dispatchEvent(new MouseEvent("mouseenter"));
		month?.click();
		await flush();
		expect(h.hovered).toEqual([`j/${formatPeriodicTokens("YYYY-MM", now())}.md`]);
		expect(h.opened).toEqual([`j/${formatPeriodicTokens("YYYY-MM", now())}.md`]);
	});

	it("follows navigation to the next month", async () => {
		const h = mount({ config: all });
		button(h, "next").click();
		await flush();
		const next = new Date(now().getFullYear(), now().getMonth() + 1, 1);
		expect(title(h)?.textContent?.replace(/\s+/g, " ").trim()).toBe(monthTitle(next));
	});

	it("shows a linked year in year views", async () => {
		const h = mount({ config: all });
		internals(h).calendar.changeView("multiMonthYear");
		await flush();
		expect(links(h).map((el) => el.textContent)).toEqual([formatPeriodicTokens("YYYY", now())]);
	});

	describe("week, 3-day, and day views", () => {
		const every = { ...all, periodicWeekPath: "j/GGGG-[W]WW", periodicDayPath: "j/YYYY-MM-DD" };
		const at = (h: CalendarHarness, view: string) => {
			internals(h).calendar.changeView(view);
			return flush();
		};
		const isoWeek = (date: Date) => `W${formatPeriodicTokens("W", date)}`;
		/** Thursday of the week containing today (Monday start): the anchor the title resolves from. */
		const weekThursday = () => {
			const t = now();
			return new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7) + 3);
		};
		const monthParts = (date: Date) => [
			formatPeriodicTokens("MMMM", date),
			formatPeriodicTokens("YYYY", date),
			`Q${formatPeriodicTokens("Q", date)}`,
		];

		it("links the week, then the month, year, and quarter of its middle day", async () => {
			const h = mount({ config: every });
			await at(h, "timeGridWeek");
			const anchor = weekThursday();
			expect(links(h).map((el) => el.textContent)).toEqual([
				isoWeek(anchor),
				...monthParts(anchor),
			]);
			expect(title(h)?.textContent?.replace(/s+/g, " ").trim()).toBe(
				`${isoWeek(anchor)} · ${monthTitle(anchor)}`,
			);
		});

		it("does the same for the 3-day view, resolved from its middle day", async () => {
			const h = mount({ config: every });
			await at(h, "timeGridThreeDay");
			const middle = new Date(now().getFullYear(), now().getMonth(), now().getDate() + 1);
			expect(links(h).map((el) => el.textContent)).toEqual([
				isoWeek(middle),
				...monthParts(middle),
			]);
		});

		it("leads the day view with a day link, then the week, month, year, and quarter", async () => {
			const h = mount({ config: every });
			await at(h, "timeGridDay");
			expect(links(h).map((el) => el.textContent)).toEqual([
				formatPeriodicTokens("ddd D", now()),
				isoWeek(now()),
				...monthParts(now()),
			]);
		});

		it("opens the week and day notes that exist from the title", async () => {
			const today = formatPeriodicTokens("YYYY-MM-DD", now());
			const week = formatPeriodicTokens("GGGG-[W]WW", now());
			const h = mount({ config: every, existingFiles: [`j/${today}.md`, `j/${week}.md`] });
			await at(h, "timeGridDay");
			const [day, wk] = links(h);
			expect(day?.querySelector(".planner-title-dot")).not.toBeNull();
			expect(wk?.querySelector(".planner-title-dot")).not.toBeNull();
			day?.click();
			wk?.click();
			await flush();
			expect(h.opened).toEqual([`j/${today}.md`, `j/${week}.md`]);
		});

		it("keeps FullCalendar's title where no part of the view is linkable", async () => {
			const h = mount({ config: { periodicDayPath: "j/YYYY-MM-DD" } });
			await at(h, "timeGridWeek");
			expect(links(h)).toHaveLength(0);
			expect(title(h)?.textContent).not.toMatch(/·/);
			expect(title(h)?.textContent).not.toBe("");
			await at(h, "dayGridMonth");
			expect(links(h)).toHaveLength(0);
		});

		it("leaves the list view on FullCalendar's own title", async () => {
			const h = mount({ config: every });
			await at(h, "listWeek");
			expect(links(h)).toHaveLength(0);
			expect(title(h)?.textContent).not.toBe("");
		});
	});
});

describe("BasesCalendarView periodic notes as events", () => {
	const notes = [
		{
			path: `journal/${dayOffset(0)}.md`,
			title: "Daily",
			date_start: dayOffset(0),
			date_end: dayOffset(0),
			status: "planned",
		},
		{
			path: "Projects/Meeting.md",
			title: "Meeting",
			date_start: dayOffset(0, 9),
			date_end: dayOffset(0, 10),
			status: "active",
		},
	];

	it("does not draw a period note as an event once its period is configured", () => {
		const h = mount({ notes, config: { periodicDayPath: "journal/YYYY-MM-DD" } });
		expect(
			internals(h)
				.calendar.getEvents()
				.map((e) => e.title),
		).toEqual(["Meeting"]);
	});

	it("draws everything while no period is configured", () => {
		const h = mount({ notes });
		expect(
			internals(h)
				.calendar.getEvents()
				.map((e) => e.title)
				.sort(),
		).toEqual(["Daily", "Meeting"]);
	});
});

describe("BasesCalendarView time format", () => {
	it("shows time-grid slot labels on a 24-hour clock", async () => {
		const h = mount({ config: { defaultView: "timeGridWeek" } });
		await flush();
		const labels = [...h.host.querySelectorAll(".planner-fc-slot-label")].map(
			(el) => el.textContent ?? "",
		);
		expect(labels.join(" ")).not.toMatch(/\b(AM|PM)\b/i);
		expect(labels.some((text) => /^(1[3-9]|2[0-3])(:|$)/.test(text.trim()))).toBe(true);
	});
});
