// SPDX-License-Identifier: GPL-3.0-only
// Derived from Planner (https://github.com/SawyerRensel/Planner): src/views/BasesCalendarView.ts
// Copyright (C) 2025 Sawyer Rensel
// Modifications Copyright (C) 2026 Parkis Utama

import {
  BasesView,
  BasesViewRegistration,
  BasesEntry,
  BasesPropertyId,
  QueryController,
  setIcon,
  Notice,
} from 'obsidian';
import {
  Calendar,
  type DateSelectInfo,
  type EventClickInfo,
  type EventDropInfo,
  type EventInput,
  type EventResizeDoneInfo,
} from 'fullcalendar';
import classicThemePlugin from 'fullcalendar/themes/classic';
// FullCalendar 7 no longer injects CSS; the build merges these into styles.css.
import 'fullcalendar/skeleton.css';
import 'fullcalendar/themes/classic/theme.css';
import 'fullcalendar/themes/classic/palette.css';
import { ViewRuntime } from '../platform/dom/ViewRuntime';
import { RenderScheduler } from '../platform/dom/RenderScheduler';
import { computeRenderSignature, type RenderSignatureInput } from '../platform/bases/changeDetection';

/**
 * Type interface for BasesView grouped data entries
 */
interface BasesGroupedData {
  entries: BasesEntry[];
  key?: unknown;
  hasKey(): boolean;
}

import dayGridPlugin from 'fullcalendar/daygrid';
import timeGridPlugin from 'fullcalendar/timegrid';
import listPlugin from 'fullcalendar/list';
import interactionPlugin from 'fullcalendar/interaction';
import multiMonthPlugin from 'fullcalendar/multimonth';
import type WiseViewPlugin from '../main';
import { openFileInNewTab, showOpenFileMenuWithItems } from '../utils/openFile';
import { activateEntry } from '../platform/navigation/NavigationService';
import type { NoteTemplateDefaults, WeekDay } from '../types/settings';
import { resolvePrettyPropertiesColor } from '../integrations/PrettyPropertiesAdapter';
import { triggerHoverPreview as dispatchHoverPreview } from '../platform/navigation/NavigationService';
import { LegacyMutationGateway } from '../platform/mutations/LegacyMutationGateway';
import { entryToEvent, toISOString, toLocalISOString } from './calendar/eventMapping';
import { createCalendarOptions } from './calendar/options';
import { createCalendarEventNote } from './calendar/eventNote';
import { type PeriodicConfig, readPeriodicConfig } from './calendar/periodic/config';
import { weekAnchor, weekLabel } from './calendar/periodic/weekLinks';
import { hasPeriodLinks, hasTitleLinks, renderTitleLinks } from './calendar/periodic/titleLinks';
import { eventTemplateDefaults, existingPeriodicNotePath, isPeriodicNote, openPeriodicNote } from './calendar/periodic/notes';

export const BASES_CALENDAR_VIEW_ID = 'wise-view-calendar';

type CalendarViewType = 'multiMonthYear' | 'dayGridYear' | 'dayGridMonth' | 'timeGridWeek' | 'timeGridThreeDay' | 'timeGridDay' | 'listWeek';

/** Toolbar buttons whose DOM is adjusted after FullCalendar mounts them. */
type ManagedButton = 'yearButton' | 'yearToggleButton';

/** 24-hour clock everywhere (event times, time-grid slot labels), never AM/PM. */
const TIME_24H = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const;

const isYearView = (view: string | null | undefined): boolean =>
  view === 'multiMonthYear' || view === 'dayGridYear';

/**
 * Calendar view for Obsidian Bases
 * Displays items on a full calendar using FullCalendar's built-in headerToolbar
 */
export class BasesCalendarView extends BasesView {
  type = BASES_CALENDAR_VIEW_ID;
  private plugin: WiseViewPlugin;
  private containerEl: HTMLElement;
  private readonly runtime: ViewRuntime;
  private readonly mutations: LegacyMutationGateway;
  private calendarEl: HTMLElement | null = null;
  private calendar: Calendar | null = null;
  private currentView: CalendarViewType | null = null; // null means use config default
  private renderedDefaultView: CalendarViewType | null = null;
  private yearViewSplit: boolean = true; // true = multiMonthYear (split), false = dayGridYear (continuous)
  // Captured from each button's didMount hook; FullCalendar 7 renders buttons with hashed classes.
  private buttonEls: Partial<Record<ManagedButton, HTMLElement>> = {};
  /** PERF-002: skips rebuilding FullCalendar when an `onDataUpdated()` call is identical to the last. */
  private readonly renderScheduler = new RenderScheduler();

  // Now accepts any property ID for custom properties
  private getColorByField(): string {
    const value = this.config.get('colorBy') as string | undefined;
    return value || this.plugin.settings.calendarDefaults.colorBy;
  }

  private getDefaultView(): CalendarViewType {
    const value = this.config.get('defaultView') as string | undefined;
    const validViews: CalendarViewType[] = ['multiMonthYear', 'dayGridYear', 'dayGridMonth', 'timeGridWeek', 'timeGridThreeDay', 'timeGridDay', 'listWeek'];
    if (value && validViews.includes(value as CalendarViewType)) {
      return value as CalendarViewType;
    }
    const def = this.plugin.settings.calendarDefaults.defaultView;
    return (validViews.includes(def as CalendarViewType) ? def : 'dayGridMonth') as CalendarViewType;
  }

  /** Title property; null means events show the file name. */
  private getTitleField(): string | null {
    const value = this.config.get('titleField') as string | undefined;
    return value || null;
  }

  /** Property marking all-day events; null means all-day follows the start time. */
  private getAllDayField(): string | null {
    const value = this.config.get('allDayField') as string | undefined;
    return value || null;
  }

  private getDateStartField(): string {
    const value = this.config.get('dateStartField') as string | undefined;
    return value || this.plugin.settings.calendarDefaults.dateStartField;
  }

  private getDateEndField(): string {
    const value = this.config.get('dateEndField') as string | undefined;
    return value || this.plugin.settings.calendarDefaults.dateEndField;
  }

  private getYearContinuousRowHeight(): number {
    const value = this.config.get('yearContinuousRowHeight') as number | undefined;
    return value ?? 60;
  }

  private getYearSplitRowHeight(): number {
    const value = this.config.get('yearSplitRowHeight') as number | undefined;
    return value ?? 60;
  }

  private getWeekStart(): WeekDay {
    const value = this.config.get('weekStartsOn') as string | undefined;
    const valid: WeekDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (value && valid.includes(value as WeekDay)) return value as WeekDay;
    return this.plugin.settings.calendarDefaults.weekStartsOn;
  }

  private getFontSize(): number {
    const value = this.config.get('fontSize') as number | undefined;
    return value ?? this.plugin.settings.calendarDefaults.fontSize;
  }

  private getPeriodicConfig(): PeriodicConfig {
    return readPeriodicConfig((key) => this.config.get(key), this.getWeekStartDay());
  }

  /** Existing daily note for the dot and hover preview; null when the day period is not configured. */
  private getDayNotePath(date: Date): string | null {
    return existingPeriodicNotePath(this.app, date, 'day', this.getPeriodicConfig());
  }

  /** Opens or creates the day's note; does nothing when the day period is not configured. */
  private async openDayNote(date: Date): Promise<void> {
    await openPeriodicNote(this.app, date, 'day', this.getPeriodicConfig());
  }

  private getTemplateDefaults(): NoteTemplateDefaults {
    const templatePath = this.config.get('templatePath') as string | undefined;
    const targetFolder = this.config.get('targetFolder') as string | undefined;
    const titleFormat = this.config.get('titleFormat') as string | undefined;
    return {
      templatePath: templatePath?.trim() ?? '',
      targetFolder: targetFolder?.trim() ?? '',
      titleFormat: titleFormat?.trim() || 'Event {{date}} {{time}}',
    };
  }

  constructor(
    controller: QueryController,
    containerEl: HTMLElement,
    plugin: WiseViewPlugin
  ) {
    super(controller);
    this.plugin = plugin;
    this.containerEl = containerEl;
    this.runtime = new ViewRuntime(containerEl);
    this.mutations = new LegacyMutationGateway(this.app);
    // Registered once; each closure reads the current `this.calendar`/class state at dispose
    // time, so it stays correct across however many times render() replaces the calendar.
    this.runtime.add(() => {
      this.calendar?.destroy();
      this.calendar = null;
    });
    this.runtime.add(() => this.containerEl.removeClass('planner-bases-calendar'));
    this.setupContainer();
  }

  private setupContainer(): void {
    this.containerEl.empty();
    this.containerEl.addClass('planner-bases-calendar');

    // Single calendar element - no separate toolbar
    this.calendarEl = this.containerEl.createDiv({ cls: 'planner-calendar-container' });
  }

  /**
   * Called when data changes - re-render the calendar
   */
  onDataUpdated(): void {
    // PERF-002: an identical update (same entries/order/groups/config as last time) skips
    // tearing down and rebuilding the whole FullCalendar instance, the same way Timeline's
    // RenderScheduler does.
    const decision = this.renderScheduler.decide(computeRenderSignature(this.buildRenderSignatureInput()));
    if (decision === 'skip') return;
    this.render();
  }

  /** Only the primitives that affect the calendar's rendered output (spec §2.2). */
  private buildRenderSignatureInput(): RenderSignatureInput {
    const entries = this.data.groupedData.flatMap((group: { entries: BasesEntry[] }) =>
      group.entries.map(entry => ({ path: entry.file.path, mtime: entry.file.stat?.mtime ?? 0 }))
    );
    const groupedData = this.data.groupedData as { hasKey(): boolean; key?: unknown }[];
    const groupKeys = groupedData.map(group => (group.hasKey() ? String(group.key) : ''));
    return {
      entries,
      order: [],
      groupKeys,
      config: {
        colorBy: this.getColorByField(),
        defaultView: this.getDefaultView(),
        titleField: this.getTitleField(),
        allDayField: this.getAllDayField(),
        dateStartField: this.getDateStartField(),
        dateEndField: this.getDateEndField(),
        yearContinuousRowHeight: this.getYearContinuousRowHeight(),
        yearSplitRowHeight: this.getYearSplitRowHeight(),
        weekStartsOn: this.getWeekStart(),
        fontSize: this.getFontSize(),
        periodic: this.getPeriodicConfig(),
        templateDefaults: this.getTemplateDefaults(),
      },
    };
  }

  onunload(): void {
    // FullCalendar 7 tracks its container size itself, so no ResizeObserver is needed.
    // Destroying the calendar and clearing the shared container's class both run through the
    // runtime's DisposableScope, registered once in the constructor; dispose() is idempotent.
    this.runtime.dispose();
  }

  private render(): void {
    const defaultView = this.getDefaultView();
    // Preserve the user's in-calendar selection across data refreshes, but honor a changed
    // defaultView when Obsidian switches this instance to another saved Bases view.
    const defaultViewChanged = this.renderedDefaultView !== null && this.renderedDefaultView !== defaultView;
    let currentDate: Date | undefined;
    let currentViewType: CalendarViewType | undefined;
    if (this.calendar) {
      currentDate = this.calendar.getDate();
      currentViewType = defaultViewChanged ? defaultView : this.calendar.view?.type as CalendarViewType;
      this.calendar.destroy();
      this.calendar = null;
    }
    this.renderedDefaultView = defaultView;

    // Re-setup the container if needed
    if (!this.calendarEl || !this.calendarEl.isConnected) {
      this.setupContainer();
    } else {
      this.calendarEl.empty();
    }

    // Build color map cache before initializing calendar
    if (this.calendarEl) {
      this.initCalendar(currentDate, currentViewType);
    }
  }

  private initCalendar(initialDate?: Date, initialView?: CalendarViewType): void {
    if (!this.calendarEl) return;

    const weekStartsOn = this.getWeekStartDay();
    const events = this.getEventsFromData();
    const periodic = this.getPeriodicConfig();
    // One persistent element: FullCalendar's toolbar element generator never receives the date, so
    // `datesSet` rewrites it on load, navigation, and view changes.
    const titleEl = hasTitleLinks(periodic) ? this.runtime.doc.createElement('span') : null;
    if (titleEl) titleEl.className = 'planner-fc-title';

    // Use provided view, or current view if re-rendering, or config default for first render
    const viewToUse = initialView || this.currentView || this.getDefaultView();
    this.buttonEls = {};

    this.calendar = new Calendar(this.calendarEl, {
      plugins: [classicThemePlugin, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, multiMonthPlugin],
      initialView: viewToUse,
      initialDate: initialDate,
      // View buttons are named after their views so FullCalendar tracks which one is selected.
      headerToolbar: {
        left: 'yearToggleButton,yearButton,dayGridMonth,timeGridWeek,timeGridThreeDay,timeGridDay,listWeek',
        center: titleEl ? 'periodTitle' : 'title',
        right: 'refreshButton prev,todayButton,next',
      },
      toolbarElements: titleEl ? { periodTitle: () => ({ domNodes: [titleEl] }) } : undefined,
      datesSet: (info) => {
        if (!titleEl) return;
        renderTitleLinks(titleEl, info.view, periodic, {
          existingPath: (date, kind) => existingPeriodicNotePath(this.app, date, kind, periodic),
          open: (date, kind) => { void openPeriodicNote(this.app, date, kind, periodic); },
          preview: (event, path, target) => this.triggerHoverPreview(event, path, target),
        });
      },
      views: {
        timeGridThreeDay: {
          type: 'timeGrid',
          duration: { days: 3 },
        },
      },
      buttons: {
        yearButton: {
          text: 'Y',
          hint: 'Year view',
          click: () => this.calendar?.changeView(this.yearViewSplit ? 'multiMonthYear' : 'dayGridYear'),
          didMount: (info) => {
            this.buttonEls.yearButton = info.el;
            this.updateActiveViewButton(this.currentView ?? viewToUse);
          },
        },
        dayGridMonth: { text: 'M', hint: 'Month view' },
        timeGridWeek: { text: 'W', hint: 'Week view' },
        timeGridThreeDay: { text: '3', hint: '3-day view' },
        timeGridDay: { text: 'D', hint: 'Day view' },
        listWeek: { text: 'L', hint: 'List view' },
        yearToggleButton: {
          text: '',
          hint: 'Toggle year view mode',
          click: () => this.toggleYearViewMode(),
          didMount: (info) => {
            this.buttonEls.yearToggleButton = info.el;
            this.updateYearToggleEnabled(isYearView(this.currentView ?? viewToUse));
            this.updateYearToggleButtonContent();
          },
        },
        todayButton: {
          text: '',
          hint: 'Go to today',
          click: () => this.calendar?.today(),
          didMount: (info) => setIcon(info.el, 'square-split-horizontal'),
        },
        refreshButton: {
          text: '',
          hint: 'Refresh calendar',
          click: () => this.refreshCalendar(),
          didMount: (info) => setIcon(info.el, 'refresh-ccw'),
        },
      },
      // FullCalendar 7 renders hashed utility classes; these hooks add stable classes for styles.css.
      buttonClass: (info) => `planner-fc-button planner-fc-button-${info.name}${info.isSelected ? ' is-active' : ''}`,
      toolbarClass: 'planner-fc-toolbar',
      toolbarSectionClass: 'planner-fc-toolbar-section',
      toolbarTitleClass: 'planner-fc-title',
      dayHeaderInnerClass: (info) => `planner-fc-day-header${info.isToday ? ' is-today' : ''}`,
      viewClass: (info) => `planner-fc-view planner-fc-view-${info.view.type}`,
      dayRowClass: 'planner-fc-row',
      dayCellTopInnerClass: (info) => `planner-fc-day-number${info.isToday ? ' is-today' : ''}`,
      singleMonthHeaderInnerClass: 'planner-fc-month-title',
      slotHeaderInnerClass: 'planner-fc-slot-label',
      allDayHeaderInnerClass: 'planner-fc-slot-label',
      moreLinkClass: 'planner-fc-more-link',
      listDayHeaderInnerClass: (info) => `planner-fc-list-day-text${info.isToday ? ' is-today' : ''}`,
      eventClass: 'planner-fc-event',
      listItemEventClass: 'planner-fc-event planner-fc-list-event',
      firstDay: weekStartsOn,
      selectable: true,
      selectMirror: true,
      editable: true,
      eventStartEditable: true,
      eventDurationEditable: true,
      eventResizableFromStart: true,
      // Day numbers, day headers, and week numbers are links only while a period they open is
      // configured; a Base with no periodic settings has no links.
      navLinks: hasPeriodLinks(periodic),
      // Clicking a day number, day header, or list day header opens the day's periodic note
      navLinkDayClick: (date) => { void this.openDayNote(date); },
      // Week numbers appear only when the Base configures weekly notes; each links to that week's note.
      weekNumbers: periodic.periods.week.pattern !== '',
      inlineWeekNumberClass: 'planner-fc-week-number',
      inlineWeekNumberContent: (info) => (info.date ? { html: weekLabel(info.date, periodic) } : true),
      inlineWeekNumberDidMount: (arg) => {
        const path = existingPeriodicNotePath(this.app, weekAnchor(arg.date), 'week', periodic);
        if (!path) return;
        arg.el.createSpan({ cls: 'planner-journal-dot planner-week-dot' });
        arg.el.addEventListener('mouseenter', (e) => {
          this.triggerHoverPreview(e, path, arg.el);
        });
      },
      navLinkWeekClick: (weekStart) => { void openPeriodicNote(this.app, weekAnchor(weekStart), 'week', periodic); },
      events: events,
      eventClick: (info) => { void this.handleEventClick(info); },
      eventDidMount: (info) => {
        const path = this.getEventPath(info.event.extendedProps);
        if (!path) return;
        info.el.addEventListener('contextmenu', (e) => {
          // Resolved fresh at click time — never the closure-captured entry (spec §7.5).
          const entry = this.findEntryByPath(path);
          if (entry) this.showEventContextMenu(entry, e);
        });
        // Page Preview source settings decide whether hover requires Ctrl/Cmd.
        info.el.addEventListener('mouseenter', (e) => {
          this.triggerHoverPreview(e, path, info.el);
        });
      },
      eventDrop: (info) => { void this.handleEventDrop(info); },
      eventResize: (info) => { void this.handleEventResize(info); },
      select: (info) => this.handleDateSelect(info),
      dayCellDidMount: (arg) => {
        // Compute journal path once at mount time (reused for dot indicator and hover preview)
        const journalPath = this.getDayNotePath(arg.date);
        if (!journalPath) return;
        const dayNumberEl = arg.el.querySelector<HTMLElement>('.planner-fc-day-number');
        if (!dayNumberEl) return;
        dayNumberEl.parentElement?.createSpan({ cls: 'planner-journal-dot' });
        // Page Preview source settings decide whether hover requires Ctrl/Cmd.
        dayNumberEl.addEventListener('mouseenter', (e) => {
          this.triggerHoverPreview(e, journalPath, dayNumberEl);
        });
      },
      dayHeaderDidMount: (arg) => {
        // Only dated headers (day/week views) are links; month view headers are weekday names.
        if (!arg.hasNavLink) return;
        const journalPath = this.getDayNotePath(arg.date);
        const textEl = arg.el.querySelector<HTMLElement>('.planner-fc-day-header');
        if (!journalPath || !textEl) return;
        textEl.addEventListener('mouseenter', (e) => {
          this.triggerHoverPreview(e, journalPath, textEl);
        });
      },
      listDayHeaderDidMount: (arg) => {
        const journalPath = this.getDayNotePath(arg.date);
        if (!journalPath) return;
        arg.el.querySelectorAll<HTMLElement>('.planner-fc-list-day-text').forEach((textEl) => {
          textEl.addEventListener('mouseenter', (e) => {
            this.triggerHoverPreview(e, journalPath, textEl);
          });
        });
      },
      viewDidMount: (arg) => {
        // Track view type changes
        const newViewType = arg.view.type as CalendarViewType;
        this.currentView = newViewType;
        this.updateYearToggleEnabled(isYearView(newViewType));
        this.updateYearToggleButtonContent();
        this.updateActiveViewButton(newViewType);
      },
      height: '100%',
      expandRows: true,
      eventTimeFormat: TIME_24H,
      slotHeaderFormat: TIME_24H,
      nowIndicator: true,
      dayMaxEvents: true,
      // FullCalendar 7 resizes with its container and always attaches drag mirrors to <body>,
      // which also avoids offsets from CSS transforms on Obsidian's workspace containers.
    });

    this.calendar.render();

    // Apply font size CSS variable
    this.calendarEl.style.setProperty('--planner-calendar-font-size', `${this.getFontSize()}px`);

    // Apply year view row height CSS variables
    this.calendarEl.style.setProperty('--planner-year-continuous-row-height', `${this.getYearContinuousRowHeight()}px`);
    this.calendarEl.style.setProperty('--planner-year-split-row-height', `${this.getYearSplitRowHeight()}px`);
  }

  private toggleYearViewMode(): void {
    if (!this.calendar || !isYearView(this.currentView)) return;

    this.yearViewSplit = !this.yearViewSplit;
    const newView = this.yearViewSplit ? 'multiMonthYear' : 'dayGridYear';
    this.calendar.changeView(newView);

    // Update button text/icon
    this.updateYearToggleButtonContent();
  }

  private refreshCalendar(): void {
    // Re-render the calendar (like closing and reopening)
    this.render();
  }

  // Button state lives in data attributes: FullCalendar owns (and re-renders) the class list.
  private updateYearToggleEnabled(enabled: boolean): void {
    const toggleBtn = this.buttonEls.yearToggleButton;
    if (!toggleBtn) return;
    if (enabled) {
      delete toggleBtn.dataset.plannerDisabled;
      toggleBtn.removeAttribute('aria-disabled');
    } else {
      toggleBtn.dataset.plannerDisabled = 'true';
      toggleBtn.setAttribute('aria-disabled', 'true');
    }
  }

  private updateYearToggleButtonContent(): void {
    const toggleBtn = this.buttonEls.yearToggleButton;
    if (!toggleBtn) return;
    toggleBtn.empty();
    // Use different icons for split vs continuous mode
    // layout-grid = split by month (⧉), align-justify = continuous scroll (☰)
    setIcon(toggleBtn, this.yearViewSplit ? 'layout-grid' : 'align-justify');
    toggleBtn.setAttribute('title', this.yearViewSplit ? 'Switch to continuous scroll' : 'Switch to split by month');
  }

  private updateActiveViewButton(viewType: CalendarViewType): void {
    // Month/week/day/list buttons get `is-active` from buttonClass. The year button covers two views.
    const yearBtn = this.buttonEls.yearButton;
    if (!yearBtn) return;
    if (isYearView(viewType)) {
      yearBtn.dataset.plannerActive = 'true';
    } else {
      delete yearBtn.dataset.plannerActive;
    }
  }

  private getEventsFromData(): EventInput[] {
    const events: EventInput[] = [];
    const periodic = this.getPeriodicConfig();
    const groupedData = this.data.groupedData as BasesGroupedData[];
    const colorByProp = this.getColorByField();

    for (const group of groupedData) {
      for (const entry of group.entries) {
        const event = entryToEvent(entry, {
          dateStartField: this.getDateStartField(),
          dateEndField: this.getDateEndField(),
          titleField: this.getTitleField(),
          allDayField: this.getAllDayField(),
          colorByProp,
          valueStyleColor: (property, value) =>
            this.plugin.settings.valueStyles[property]?.[value]?.color ?? null,
          resolvePrettyPropertiesColor: (property, value) =>
            resolvePrettyPropertiesColor(this.runtime.win, this.runtime.doc, property, value),
        });
        // Period notes are reached through the calendar's period links, not drawn as events.
        if (event && !isPeriodicNote(String(event.id), String(event.start), periodic)) {
          events.push(event);
        }
      }
    }

    return events;
  }

  private getWeekStartDay(): number {
    const dayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    return dayMap[this.getWeekStart()] ?? 1;
  }

  private getContrastColor(hexColor: string): string {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  private async handleEventClick(info: EventClickInfo): Promise<void> {
    const path = this.getEventPath(info.event.extendedProps);
    if (!path) return;
    const jsEvent = info.jsEvent instanceof MouseEvent ? info.jsEvent : null;
    activateEntry({
      app: this.app,
      settings: this.plugin.settings,
      path,
      event: jsEvent,
      openFull: (p) => openFileInNewTab(this.app, p),
    });
  }

  private async handleEventDrop(info: EventDropInfo): Promise<void> {
    await this.applyDateRangeMutation(info.event.extendedProps, info.event.start, info.event.end, info.revert);
  }

  private async handleEventResize(info: EventResizeDoneInfo): Promise<void> {
    await this.applyDateRangeMutation(info.event.extendedProps, info.event.start, info.event.end, info.revert);
  }

  /** Shared by drag (drop) and resize: writes the new range through the legacy mutation capability. */
  private async applyDateRangeMutation(
    extendedProps: unknown,
    newStart: Date | null,
    newEnd: Date | null,
    revert: () => void,
  ): Promise<void> {
    const path = this.getEventPath(extendedProps);
    if (!path || !newStart) {
      revert();
      return;
    }

    // Use local timezone format for user-friendly display in frontmatter.
    const result = await this.mutations.updateRange(
      path,
      this.getDateStartField(),
      toLocalISOString(newStart),
      this.getDateEndField(),
      newEnd ? toLocalISOString(newEnd) : null,
    );
    if (!result.ok) revert();
  }

  private handleDateSelect(info: DateSelectInfo): void {
    void this.createNewItem(info);
  }

  /** Path only — the event model never carries a live BasesEntry (spec §7.5). */
  private getEventPath(extendedProps: unknown): string | null {
    const path = (extendedProps as { path?: unknown } | null)?.path;
    return typeof path === 'string' ? path : null;
  }

  /** Resolves the current entry for `path` at interaction time; never stored beyond this call. */
  private findEntryByPath(path: string): BasesEntry | null {
    const groupedData = this.data.groupedData as BasesGroupedData[];
    for (const group of groupedData) {
      for (const entry of group.entries) {
        if (entry.file.path === path) return entry;
      }
    }
    return null;
  }

  private showEventContextMenu(entry: BasesEntry, event: MouseEvent): void {
    showOpenFileMenuWithItems(
      this.app,
      entry.file.path,
      event,
      (menu) => {
        menu.addItem(item => {
          item
            .setTitle('Create new event note')
            .setIcon('plus')
            .onClick(() => {
              const start = this.getEventStartForNewItem(entry);
              void this.createNewItemAt(start);
            });
        });

        menu.addItem(item => {
          item
            .setTitle('Scroll to today')
            .setIcon('calendar')
            .onClick(() => this.scrollToToday());
        });
      },
      (menu) => {
        menu.addItem(item => {
          item
            .setTitle('Delete event note')
            .setIcon('trash')
            .setWarning(true)
            .onClick(() => {
              void this.deleteEventNote(entry);
            });
        });
      },
    );
  }

  private scrollToToday(): void {
    this.calendar?.today();
  }

  private async deleteEventNote(entry: BasesEntry): Promise<void> {
    const result = await this.mutations.trash(entry.file.path);
    if (result.ok) new Notice(`Deleted ${entry.file.basename}`);
  }

  /**
   * Trigger Obsidian's Page Preview for a file path.
   * Obsidian's Page Preview plugin applies the modifier-key behavior configured
   * for this registered hover source.
   */
  private triggerHoverPreview(event: MouseEvent, filePath: string, targetEl: HTMLElement): void {
    dispatchHoverPreview({
      app: this.app,
      hoverParent: this.plugin,
      sourceId: BASES_CALENDAR_VIEW_ID,
      event,
      filePath,
      targetEl,
    });
  }

  private async createNewItem(selection: DateSelectInfo): Promise<void> {
    if (!this.isTimeGridView(selection.view.type)) {
      this.calendar?.unselect();
      return;
    }

    try {
      await this.createNewItemFromDates(selection.start, selection.end, selection.allDay);
    } finally {
      this.calendar?.unselect();
    }
  }

  private async createNewItemFromDates(start: Date, end: Date | null, allDay: boolean): Promise<void> {
    const defaults = eventTemplateDefaults(this.getTemplateDefaults(), start, this.getPeriodicConfig());
    if (!defaults) return;
    await createCalendarEventNote(
      this.app,
      this,
      defaults,
      { dateStartField: this.getDateStartField(), dateEndField: this.getDateEndField() },
      start,
      end,
      allDay,
    );
  }

  private async createNewItemAt(start: Date): Promise<void> {
    if (!this.calendar || !this.isTimeGridView(this.calendar.view.type)) return;
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    await this.createNewItemFromDates(start, end, false);
  }

  private isTimeGridView(viewType: string): boolean {
    return viewType === 'timeGridDay' || viewType === 'timeGridThreeDay' || viewType === 'timeGridWeek';
  }

  private getEventStartForNewItem(entry: BasesEntry): Date {
    const value = entry.getValue(this.getDateStartField() as BasesPropertyId);
    const parsed = value ? new Date(toISOString(value)) : null;
    if (parsed && !isNaN(parsed.getTime())) return parsed;
    return this.calendar?.getDate() ?? new Date();
  }

}

/**
 * Create the Bases view registration for the Calendar
 */
export function createCalendarViewRegistration(plugin: WiseViewPlugin): BasesViewRegistration {
  return {
    name: 'Calendar',
    icon: 'calendar-range',
    factory: (controller: QueryController, containerEl: HTMLElement) => {
      return new BasesCalendarView(controller, containerEl, plugin);
    },
    options: () => createCalendarOptions(plugin),
  };
}
