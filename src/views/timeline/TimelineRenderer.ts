// SPDX-License-Identifier: GPL-3.0-only AND MIT
// Portions adapted from obsidian-project-manager (https://github.com/mmattia09/obsidian-project-manager): src/timeline-view.ts
// Copyright (c) 2026 mmattia09. MIT License, see THIRD_PARTY_NOTICES.md
// Modifications Copyright (C) 2026 Parkis Utama

import { setIcon } from 'obsidian';
import { calculateTimeDomain, rangeToDayBounds, todayPosition, type TimeDomain } from '../../core/temporal/TimeDomain';
import { dateToPixel, TIMELINE_ZOOM_SPECS, type TimelineZoom } from '../../core/temporal/TimelineScale';
import { dateOnlyFromDayIndex, type DateOnlyValue } from '../../core/temporal/TemporalValue';
import { VirtualLinearCollection, type VirtualRowHandle } from '../../platform/dom/VirtualLinearCollection';
import { resolveColor, toCssVariables } from '../../platform/colors/ColorResolver';
import { flattenTimelineRows, type TimelineItem, type TimelineModel, type TimelineVirtualRow } from './TimelineModel';

const ZOOM_ORDER: readonly TimelineZoom[] = ['fiveyear', 'year', 'quarter', 'month', 'biweek', 'week', 'day'];
/** Tall enough that a two-line wrapped title still gets breathing room above/below its text. */
const ROW_HEIGHT = 44;
const DEFAULT_SPAN: Readonly<Record<TimelineZoom, number>> = {
	day: 1,
	week: 3,
	biweek: 5,
	month: 7,
	quarter: 14,
	year: 30,
	fiveyear: 90,
};

function touchDistance(event: TouchEvent): number {
	const first = event.touches[0];
	const second = event.touches[1];
	return first && second ? Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY) : 0;
}

export interface TimelineRendererActions {
	onQuickSchedule?(path: string, startDay: number, endDay: number): void;
	onRangeChange?(path: string, startDay: number, endDay: number): Promise<boolean> | boolean;
	onZoomChange?(zoom: TimelineZoom): void;
}

interface TimelineDragState {
	path: string;
	barEl: HTMLElement;
	mode: 'move' | 'resize-left' | 'resize-right';
	pointerId: number;
	x0: number;
	start0: number;
	end0: number;
	start: number;
	end: number;
	moved: boolean;
}

export interface TimelineBarLayout {
	item: TimelineItem;
	left: number;
	width: number;
}

export interface TimelineLayout {
	domain: TimeDomain;
	width: number;
	todayLeft: number;
	todayEdge: 'before' | 'inside' | 'after';
	bars: TimelineBarLayout[];
}

/** All horizontal geometry is derived exclusively through Temporal Core. */
export function createTimelineLayout(
	model: TimelineModel,
	today: DateOnlyValue,
	zoom: TimelineZoom,
	viewportWidth = 500,
	extraPaddingDays = 0,
): TimelineLayout {
	const scheduled = model.groups.flatMap(group => group.items).filter(item => item.range != null);
	const bounds = scheduled.map(item => rangeToDayBounds(item.range!));
	const pixelsPerDay = TIMELINE_ZOOM_SPECS[zoom].pixelsPerDay;
	const paddingDays = Math.max(14, Math.ceil(Math.max(1, viewportWidth) / pixelsPerDay)) + extraPaddingDays;
	const rawDomain = calculateTimeDomain(bounds, { today, paddingDays, minimumSpanDays: paddingDays * 2, includeToday: true });
	const weekday = new Date(rawDomain.startDay * 86_400_000).getUTCDay();
	const domain = {
		...rawDomain,
		startDay: rawDomain.startDay - ((weekday + 6) % 7),
	};
	domain.spanDays = domain.endDay - domain.startDay;
	return {
		domain,
		width: dateToPixel(domain.endDay, domain, zoom),
		todayLeft: dateToPixel(today.dayIndex + 0.5, domain, zoom),
		todayEdge: todayPosition(domain, today),
		bars: scheduled.map(item => {
			const range = rangeToDayBounds(item.range!);
			return {
				item,
				left: dateToPixel(range.startDay, domain, zoom),
				width: Math.max(8, dateToPixel(range.endDay, domain, zoom) - dateToPixel(range.startDay, domain, zoom) - 2),
			};
		}),
	};
}

export class TimelineRenderer {
	private readonly toolbarEl: HTMLElement;
	private readonly sidebarPanel: HTMLElement;
	private readonly emptyEl: HTMLElement;
	private readonly sidebarViewport: HTMLElement;
	private readonly timelineViewport: HTMLElement;
	private readonly headerEl: HTMLElement;
	private readonly headerCanvas: HTMLElement;
	private readonly gridEl: HTMLElement;
	private readonly sidebarRows: VirtualLinearCollection<TimelineVirtualRow>;
	private readonly timelineRows: VirtualLinearCollection<TimelineVirtualRow>;
	private readonly collapsedGroups = new Set<string>();
	private currentModel: TimelineModel | null = null;
	private currentToday: DateOnlyValue | null = null;
	private activeZoom: TimelineZoom | null = null;
	private currentLayout: TimelineLayout | null = null;
	private bars = new Map<string, TimelineBarLayout>();
	private readonly pendingRanges = new Map<string, { startDay: number; endDay: number }>();
	private syncingScroll = false;
	private sidebarCollapsed = false;
	private pinchAccum = 0;
	private pinchDistance: number | null = null;
	private quickScheduleGhost: HTMLElement | null = null;
	private quickScheduleStart = 0;
	private quickScheduleEnd = 0;
	private drag: TimelineDragState | null = null;
	private suppressBarClick = false;
	private extraPaddingDays = 0;
	private layoutViewportWidth = 0;
	private wrapTitles = false;
	private extendingDomain = false;
	private readonly syncFromSidebar = (): void => this.syncScroll(this.sidebarViewport, this.timelineViewport);
	private readonly syncFromTimeline = (): void => {
		this.syncScroll(this.timelineViewport, this.sidebarViewport);
		this.syncHorizontalHeader();
		this.extendDomainNearEdge();
	};
	private readonly handleWheel = (event: WheelEvent): void => {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		if (this.pinchAccum !== 0 && Math.sign(event.deltaY) !== Math.sign(this.pinchAccum)) this.pinchAccum = 0;
		this.pinchAccum += event.deltaY;
		if (Math.abs(this.pinchAccum) < 24) return;
		const direction = this.pinchAccum < 0 ? 1 : -1;
		this.pinchAccum = 0;
		this.stepZoom(direction, event.clientX);
	};
	private readonly handlePointerMove = (event: PointerEvent): void => {
		if (this.drag) this.updateDrag(event);
		else this.previewQuickSchedule(event);
	};
	private readonly handlePointerLeave = (): void => this.clearQuickSchedule();
	private readonly handlePointerDown = (event: PointerEvent): void => this.startDrag(event);
	private readonly handlePointerUp = (event: PointerEvent): void => { void this.finishDrag(event); };
	private readonly handleTouchStart = (event: TouchEvent): void => {
		this.pinchDistance = event.touches.length === 2 ? touchDistance(event) : null;
	};
	private readonly handleTouchMove = (event: TouchEvent): void => {
		if (event.touches.length !== 2 || this.pinchDistance === null) return;
		event.preventDefault();
		const distance = touchDistance(event);
		const ratio = distance / this.pinchDistance;
		if (ratio <= 1.35 && ratio >= 0.75) return;
		this.pinchDistance = distance;
		const first = event.touches[0];
		const second = event.touches[1];
		if (first && second) this.stepZoom(ratio > 1 ? 1 : -1, (first.clientX + second.clientX) / 2);
	};
	private readonly handleTouchEnd = (): void => { this.pinchDistance = null; };
	private readonly handleQuickScheduleClick = (event: MouseEvent): void => {
		if (this.suppressBarClick && event.target instanceof Element && event.target.closest('.wise-view-timeline__bar')) {
			event.preventDefault();
			event.stopPropagation();
			this.suppressBarClick = false;
			return;
		}
		const ghost = event.target instanceof Element ? event.target.closest<HTMLElement>('.wise-view-timeline__ghost') : null;
		const path = ghost?.dataset.notePath;
		if (!path || !this.quickScheduleGhost) return;
		event.preventDefault();
		event.stopPropagation();
		this.actions.onQuickSchedule?.(path, this.quickScheduleStart, this.quickScheduleEnd);
	};

	constructor(private readonly containerEl: HTMLElement, private readonly actions: TimelineRendererActions = {}) {
		containerEl.classList.add('wise-view-timeline');
		this.toolbarEl = containerEl.createDiv({ cls: 'wise-view-timeline__toolbar' });
		this.toolbarEl.setAttribute('role', 'toolbar');
		this.toolbarEl.setAttribute('aria-label', 'Timeline controls');
		const main = containerEl.createDiv({ cls: 'wise-view-timeline__main' });
		this.sidebarPanel = main.createDiv({ cls: 'wise-view-timeline__sidebar-panel' });
		// Mirrors the chart header's height so sidebar rows line up with their timeline bars —
		// without it, the sidebar column starts a header's-height too high once the toolbar
		// (which used to fill that gap) moved out to sit above both columns.
		this.sidebarPanel.createDiv({ cls: 'wise-view-timeline__sidebar-corner' });
		this.sidebarViewport = this.sidebarPanel.createDiv({ cls: 'wise-view-timeline__sidebar' });
		const chart = main.createDiv({ cls: 'wise-view-timeline__chart' });
		this.headerEl = chart.createDiv({ cls: 'wise-view-timeline__header' });
		this.headerCanvas = this.headerEl.createDiv({ cls: 'wise-view-timeline__header-canvas' });
		this.timelineViewport = chart.createDiv({ cls: 'wise-view-timeline__scroller' });
		this.gridEl = this.timelineViewport.createDiv({ cls: 'wise-view-timeline__grid' });
		this.sidebarRows = new VirtualLinearCollection(this.sidebarViewport, {
			rowHeight: ROW_HEIGHT,
			overscan: 5,
			renderRow: row => this.renderSidebarRow(row),
			updateRow: (handle, row) => this.updateSidebarRow(handle, row),
		});
		this.timelineRows = new VirtualLinearCollection(this.timelineViewport, {
			rowHeight: ROW_HEIGHT,
			overscan: 5,
			renderRow: row => this.renderTimelineRow(row),
			updateRow: (handle, row) => this.updateTimelineRow(handle, row),
		});
		this.sidebarViewport.addEventListener('scroll', this.syncFromSidebar, { passive: true });
		this.timelineViewport.addEventListener('scroll', this.syncFromTimeline, { passive: true });
		this.timelineViewport.addEventListener('wheel', this.handleWheel, { passive: false });
		this.timelineViewport.addEventListener('pointermove', this.handlePointerMove, { passive: true });
		this.timelineViewport.addEventListener('pointerdown', this.handlePointerDown);
		this.timelineViewport.addEventListener('pointerup', this.handlePointerUp);
		this.timelineViewport.addEventListener('pointercancel', this.handlePointerUp);
		this.timelineViewport.addEventListener('pointerleave', this.handlePointerLeave, { passive: true });
		this.timelineViewport.addEventListener('click', this.handleQuickScheduleClick);
		this.timelineViewport.addEventListener('touchstart', this.handleTouchStart, { passive: true });
		this.timelineViewport.addEventListener('touchmove', this.handleTouchMove, { passive: false });
		this.timelineViewport.addEventListener('touchend', this.handleTouchEnd, { passive: true });
		this.emptyEl = containerEl.createDiv({ cls: 'wise-view-timeline__empty' });
	}

	render(
		model: TimelineModel,
		today: DateOnlyValue,
		zoom: TimelineZoom,
		wrapTitles = this.wrapTitles,
		reconcilePending = false,
	): TimelineLayout {
		// An onDataUpdated model is the canonical vault state. Never let an old
		// optimistic drag continue to override dates that Bases read back.
		if (reconcilePending) this.pendingRanges.clear();
		this.currentModel = model;
		this.currentToday = today;
		this.wrapTitles = wrapTitles;
		this.containerEl.classList.toggle('wise-view-timeline--wrap-titles', wrapTitles);
		// No start property configured: the toolbar/header/grid/today below would otherwise
		// still render a fully-formed-looking calendar around "today" that tracks no real
		// property, misleadingly implying a working timeline. CSS hides that chrome under this
		// class so only the configuration hint is visible; the pipeline still runs normally
		// (with an empty model) so bars/rows from a previous configured state are cleared.
		this.containerEl.classList.toggle('wise-view-timeline--unconfigured', !model.startConfigured);
		this.activeZoom ??= zoom;
		this.layoutViewportWidth = this.timelineViewport.clientWidth || 500;
		const layout = createTimelineLayout(model, today, this.activeZoom, this.layoutViewportWidth, this.extraPaddingDays);
		this.applyPendingRanges(layout);
		this.currentLayout = layout;
		this.bars = new Map(layout.bars.map(bar => [bar.item.path, bar]));
		this.renderToolbar();
		this.renderHeader(layout, this.activeZoom);
		const rows = flattenTimelineRows(model, this.collapsedGroups);
		this.sidebarRows.updateItems(rows);
		this.timelineRows.updateItems(rows);
		this.renderGrid(layout, this.activeZoom);
		this.renderToday(layout);
		this.renderEmptyState(model, rows.length);
		return layout;
	}

	setZoom(zoom: TimelineZoom): void {
		if (this.activeZoom === zoom || !this.currentModel || !this.currentToday) return;
		this.activeZoom = zoom;
		this.render(this.currentModel, this.currentToday, zoom);
		this.actions.onZoomChange?.(zoom);
	}

	toggleGroup(groupKey: string): void {
		if (!this.currentModel || !this.currentToday || !this.activeZoom) return;
		if (this.collapsedGroups.has(groupKey)) this.collapsedGroups.delete(groupKey);
		else this.collapsedGroups.add(groupKey);
		this.render(this.currentModel, this.currentToday, this.activeZoom);
	}

	toggleSidebar(): void {
		this.sidebarCollapsed = !this.sidebarCollapsed;
		this.containerEl.classList.toggle('wise-view-timeline--sidebar-collapsed', this.sidebarCollapsed);
		this.renderToolbar();
		this.refreshViewport(true);
	}

	scrollToToday(): void {
		if (!this.currentLayout) return;
		this.timelineViewport.scrollLeft = Math.max(0, this.currentLayout.todayLeft - this.timelineViewport.clientWidth / 2);
		this.syncHorizontalHeader();
	}

	/** Picks the most zoomed-in level that still fits every scheduled item on screen at once. */
	zoomToFit(): void {
		if (!this.currentModel || !this.currentToday) return;
		const bounds = [...this.currentModel.itemsByPath.values()]
			.filter(item => item.range != null)
			.map(item => rangeToDayBounds(item.range!));
		if (bounds.length === 0) {
			this.scrollToToday();
			return;
		}
		const minStart = Math.min(...bounds.map(b => b.startDay));
		const maxEnd = Math.max(...bounds.map(b => b.endDay));
		const spanDays = Math.max(1, maxEnd - minStart);
		const viewportWidth = this.timelineViewport.clientWidth || 500;
		const fitOrder = [...ZOOM_ORDER].reverse();
		let chosen: TimelineZoom = 'fiveyear';
		for (const zoom of fitOrder) {
			if (spanDays * TIMELINE_ZOOM_SPECS[zoom].pixelsPerDay <= viewportWidth) {
				chosen = zoom;
				break;
			}
		}
		this.extraPaddingDays = 0;
		this.activeZoom = chosen;
		const layout = this.render(this.currentModel, this.currentToday, chosen);
		const left = dateToPixel(minStart, layout.domain, chosen);
		const right = dateToPixel(maxEnd, layout.domain, chosen);
		this.timelineViewport.scrollLeft = Math.max(0, (left + right) / 2 - this.timelineViewport.clientWidth / 2);
		this.syncHorizontalHeader();
		this.actions.onZoomChange?.(chosen);
	}

	setNarrow(narrow: boolean): void {
		this.containerEl.classList.toggle('wise-view-timeline--narrow', narrow);
	}

	refreshViewport(reflow = false): void {
		this.sidebarRows.refresh();
		this.timelineRows.refresh();
		const width = this.timelineViewport.clientWidth;
		if (reflow || (width > 0 && Math.abs(width - this.layoutViewportWidth) > 1)) this.reflowAtCenter();
	}

	dispose(): void {
		this.sidebarViewport.removeEventListener('scroll', this.syncFromSidebar);
		this.timelineViewport.removeEventListener('scroll', this.syncFromTimeline);
		this.timelineViewport.removeEventListener('wheel', this.handleWheel);
		this.timelineViewport.removeEventListener('pointermove', this.handlePointerMove);
		this.timelineViewport.removeEventListener('pointerdown', this.handlePointerDown);
		this.timelineViewport.removeEventListener('pointerup', this.handlePointerUp);
		this.timelineViewport.removeEventListener('pointercancel', this.handlePointerUp);
		this.timelineViewport.removeEventListener('pointerleave', this.handlePointerLeave);
		this.timelineViewport.removeEventListener('click', this.handleQuickScheduleClick);
		this.timelineViewport.removeEventListener('touchstart', this.handleTouchStart);
		this.timelineViewport.removeEventListener('touchmove', this.handleTouchMove);
		this.timelineViewport.removeEventListener('touchend', this.handleTouchEnd);
		this.clearQuickSchedule();
		this.sidebarRows.destroy();
		this.timelineRows.destroy();
		// containerEl is Obsidian's own .bases-view element, reused across view-type switches
		// (Timeline -> Table, Timeline -> Gantt, ...). Leaving our classes on it after unload would
		// leave the next view type wearing our !important flex/overflow layout.
		this.containerEl.classList.remove(
			'wise-view-timeline',
			'wise-view-timeline--wrap-titles',
			'wise-view-timeline--unconfigured',
			'wise-view-timeline--sidebar-collapsed',
			'wise-view-timeline--narrow',
		);
	}

	private reflowAtCenter(): void {
		if (!this.currentLayout || !this.currentModel || !this.currentToday || !this.activeZoom) return;
		const pixelsPerDay = TIMELINE_ZOOM_SPECS[this.activeZoom].pixelsPerDay;
		const centerOffset = this.timelineViewport.clientWidth / 2;
		const centerDay = this.currentLayout.domain.startDay
			+ (this.timelineViewport.scrollLeft + centerOffset) / pixelsPerDay;
		this.render(this.currentModel, this.currentToday, this.activeZoom, this.wrapTitles);
		this.timelineViewport.scrollLeft = Math.max(0,
			(centerDay - this.currentLayout.domain.startDay) * pixelsPerDay - centerOffset);
		this.syncHorizontalHeader();
	}

	private extendDomainNearEdge(): void {
		if (this.extendingDomain || !this.currentLayout || !this.activeZoom || !this.currentModel || !this.currentToday) return;
		const viewportWidth = this.timelineViewport.clientWidth;
		if (viewportWidth <= 0) return;
		const remainingRight = this.currentLayout.width - this.timelineViewport.scrollLeft - viewportWidth;
		if (this.timelineViewport.scrollLeft > viewportWidth / 2 && remainingRight > viewportWidth / 2) return;
		this.extendingDomain = true;
		const pixelsPerDay = TIMELINE_ZOOM_SPECS[this.activeZoom].pixelsPerDay;
		const centerDay = this.currentLayout.domain.startDay
			+ (this.timelineViewport.scrollLeft + viewportWidth / 2) / pixelsPerDay;
		this.extraPaddingDays += Math.ceil((viewportWidth * 2) / pixelsPerDay);
		this.render(this.currentModel, this.currentToday, this.activeZoom, this.wrapTitles);
		this.timelineViewport.scrollLeft = Math.max(0,
			(centerDay - this.currentLayout.domain.startDay) * pixelsPerDay - viewportWidth / 2);
		this.syncHorizontalHeader();
		this.extendingDomain = false;
	}

	private startDrag(event: PointerEvent): void {
		if (event.button !== 0 || !this.currentLayout) return;
		const target = event.target instanceof Element ? event.target : null;
		const barEl = target?.closest<HTMLElement>('.wise-view-timeline__bar');
		const path = barEl?.dataset.notePath;
		const layout = path ? this.bars.get(path) : null;
		if (!barEl || !path || !layout?.item.range) return;
		const bounds = rangeToDayBounds(layout.item.range);
		const pending = this.pendingRanges.get(path);
		const startDay = pending?.startDay ?? bounds.startDay;
		const endDay = pending?.endDay ?? bounds.endDay - 1;
		let mode: TimelineDragState['mode'] = 'move';
		if (target?.closest('.wise-view-timeline__handle--left')) mode = 'resize-left';
		else if (target?.closest('.wise-view-timeline__handle--right')) mode = 'resize-right';
		this.drag = {
			path,
			barEl,
			mode,
			pointerId: event.pointerId,
			x0: event.clientX,
			start0: startDay,
			end0: endDay,
			start: startDay,
			end: endDay,
			moved: false,
		};
		try { barEl.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer or detached DOM. */ }
		event.preventDefault();
	}

	private updateDrag(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId || !this.currentLayout || !this.activeZoom) return;
		const deltaDays = Math.round((event.clientX - drag.x0) / TIMELINE_ZOOM_SPECS[this.activeZoom].pixelsPerDay);
		if (deltaDays !== 0) drag.moved = true;
		if (drag.mode === 'move') {
			drag.start = drag.start0 + deltaDays;
			drag.end = drag.end0 + deltaDays;
		} else if (drag.mode === 'resize-left') {
			drag.start = Math.min(drag.start0 + deltaDays, drag.end0);
			drag.end = drag.end0;
		} else {
			drag.start = drag.start0;
			drag.end = Math.max(drag.end0 + deltaDays, drag.start0);
		}
		const left = dateToPixel(drag.start, this.currentLayout.domain, this.activeZoom);
		const width = Math.max(8, (drag.end - drag.start + 1) * TIMELINE_ZOOM_SPECS[this.activeZoom].pixelsPerDay - 2);
		drag.barEl.style.setProperty('--wise-view-timeline-left', `${left}px`);
		drag.barEl.style.setProperty('--wise-view-timeline-bar-width', `${width}px`);
		drag.barEl.classList.toggle('wise-view-timeline__bar--dragging', drag.moved);
		const startLabel = drag.barEl.parentElement?.querySelector<HTMLElement>('.wise-view-timeline__date-label--start');
		const endLabel = drag.barEl.parentElement?.querySelector<HTMLElement>('.wise-view-timeline__date-label--end');
		if (startLabel) {
			startLabel.setText(this.formatDay(drag.start));
			startLabel.style.setProperty('--wise-view-timeline-left', `${left}px`);
			startLabel.classList.toggle('wise-view-timeline__date-label--active', drag.moved);
		}
		if (endLabel) {
			endLabel.setText(this.formatDay(drag.end));
			endLabel.style.setProperty('--wise-view-timeline-left', `${left + width}px`);
			endLabel.classList.toggle('wise-view-timeline__date-label--active', drag.moved);
		}
	}

	private async finishDrag(event: PointerEvent): Promise<void> {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		this.drag = null;
		try { drag.barEl.releasePointerCapture(event.pointerId); } catch { /* No active capture. */ }
		if (!drag.moved) return;
		this.suppressBarClick = true;
		this.pendingRanges.set(drag.path, { startDay: drag.start, endDay: drag.end });
		const success = await this.actions.onRangeChange?.(drag.path, drag.start, drag.end) ?? false;
		if (!success) this.pendingRanges.delete(drag.path);
		if (!success && this.currentModel && this.currentToday && this.activeZoom) {
			this.render(this.currentModel, this.currentToday, this.activeZoom, this.wrapTitles);
		}
	}

	private formatDay(day: number): string {
		return new Date(day * 86_400_000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
	}

	private stepZoom(direction: 1 | -1, clientX: number): void {
		if (!this.activeZoom || !this.currentLayout || !this.currentModel || !this.currentToday) return;
		const current = ZOOM_ORDER.indexOf(this.activeZoom);
		const next = Math.min(Math.max(current + direction, 0), ZOOM_ORDER.length - 1);
		if (next === current) return;
		const rect = this.timelineViewport.getBoundingClientRect();
		const offsetX = Math.max(0, clientX - rect.left);
		const oldPixels = TIMELINE_ZOOM_SPECS[this.activeZoom].pixelsPerDay;
		const dayUnderPointer = this.currentLayout.domain.startDay + (this.timelineViewport.scrollLeft + offsetX) / oldPixels;
		const nextZoom = ZOOM_ORDER[next]!;
		this.activeZoom = nextZoom;
		this.render(this.currentModel, this.currentToday, nextZoom);
		this.timelineViewport.scrollLeft = Math.max(0, (dayUnderPointer - this.currentLayout.domain.startDay)
			* TIMELINE_ZOOM_SPECS[nextZoom].pixelsPerDay - offsetX);
		this.syncHorizontalHeader();
		this.actions.onZoomChange?.(nextZoom);
	}

	private previewQuickSchedule(event: PointerEvent): void {
		if (!this.currentLayout || !this.activeZoom) return;
		const row = event.target instanceof Element
			? event.target.closest<HTMLElement>('.wise-view-timeline__row--unscheduled[data-note-path]')
			: null;
		const path = row?.dataset.notePath;
		if (!row || !path) {
			this.clearQuickSchedule();
			return;
		}
		const rect = this.timelineViewport.getBoundingClientRect();
		const contentX = this.timelineViewport.scrollLeft + event.clientX - rect.left;
		this.quickScheduleStart = this.currentLayout.domain.startDay
			+ Math.floor(contentX / TIMELINE_ZOOM_SPECS[this.activeZoom].pixelsPerDay);
		this.quickScheduleEnd = this.quickScheduleStart + DEFAULT_SPAN[this.activeZoom] - 1;
		if (!this.quickScheduleGhost || this.quickScheduleGhost.parentElement !== row) {
			this.clearQuickSchedule();
			this.quickScheduleGhost = row.createEl('button', { cls: 'wise-view-timeline__ghost', attr: { type: 'button' } });
			this.quickScheduleGhost.dataset.notePath = path;
		}
		const item = this.currentModel?.itemsByPath.get(path);
		this.quickScheduleGhost.setText(item?.title ?? path);
		this.quickScheduleGhost.title = `${dateOnlyFromDayIndex(this.quickScheduleStart).iso} – ${dateOnlyFromDayIndex(this.quickScheduleEnd).iso}`;
		this.quickScheduleGhost.style.setProperty('--wise-view-timeline-left', `${dateToPixel(this.quickScheduleStart, this.currentLayout.domain, this.activeZoom)}px`);
		this.quickScheduleGhost.style.setProperty('--wise-view-timeline-bar-width', `${Math.max(8, DEFAULT_SPAN[this.activeZoom]
			* TIMELINE_ZOOM_SPECS[this.activeZoom].pixelsPerDay - 2)}px`);
	}

	private clearQuickSchedule(): void {
		this.quickScheduleGhost?.remove();
		this.quickScheduleGhost = null;
	}

	private syncScroll(source: HTMLElement, destination: HTMLElement): void {
		if (this.syncingScroll || destination.scrollTop === source.scrollTop) return;
		this.syncingScroll = true;
		destination.scrollTop = source.scrollTop;
		this.sidebarRows.refresh();
		this.timelineRows.refresh();
		this.syncingScroll = false;
	}

	private syncHorizontalHeader(): void {
		this.headerCanvas.style.transform = `translateX(${-this.timelineViewport.scrollLeft}px)`;
	}

	private applyPendingRanges(layout: TimelineLayout): void {
		if (!this.activeZoom) return;
		for (const bar of layout.bars) {
			const pending = this.pendingRanges.get(bar.item.path);
			if (!pending) continue;
			const current = bar.item.range ? rangeToDayBounds(bar.item.range) : null;
			if (current?.startDay === pending.startDay && current.endDay - 1 === pending.endDay) {
				this.pendingRanges.delete(bar.item.path);
				continue;
			}
			bar.left = dateToPixel(pending.startDay, layout.domain, this.activeZoom);
			bar.width = Math.max(8, (pending.endDay - pending.startDay + 1)
				* TIMELINE_ZOOM_SPECS[this.activeZoom].pixelsPerDay - 2);
		}
	}

	private renderToolbar(): void {
		this.toolbarEl.replaceChildren();
		this.iconButton(this.toolbarEl, this.sidebarCollapsed ? 'panel-left-open' : 'panel-left-close',
			this.sidebarCollapsed ? 'Show timeline sidebar' : 'Hide timeline sidebar', 'toggle-sidebar');
		this.iconButton(this.toolbarEl, 'calendar-days', 'Today', 'today');
		this.iconButton(this.toolbarEl, 'scan', 'Zoom to fit', 'zoom-to-fit');
		const select = this.toolbarEl.createEl('select', { cls: 'dropdown wise-view-timeline__zoom' });
		select.dataset.action = 'zoom';
		select.setAttribute('aria-label', 'Timeline zoom');
		for (const zoom of Object.keys(TIMELINE_ZOOM_SPECS) as TimelineZoom[]) {
			const option = select.createEl('option', { text: TIMELINE_ZOOM_SPECS[zoom].label });
			option.value = zoom;
			option.selected = zoom === this.activeZoom;
		}
	}

	private iconButton(host: HTMLElement, icon: string, label: string, action: string): HTMLButtonElement {
		const button = host.createEl('button', { cls: 'clickable-icon wise-view-timeline__toolbar-button' });
		button.type = 'button';
		button.dataset.action = action;
		button.setAttribute('aria-label', label);
		button.title = label;
		setIcon(button, icon);
		button.createSpan({ cls: 'wise-view-timeline__toolbar-label', text: label });
		return button;
	}

	private renderHeader(layout: TimelineLayout, zoom: TimelineZoom): void {
		this.headerCanvas.replaceChildren();
		this.headerCanvas.style.setProperty('--wise-view-timeline-width', `${layout.width}px`);
		const periods = this.headerCanvas.createDiv({ cls: 'wise-view-timeline__periods' });
		const ticks = this.headerCanvas.createDiv({ cls: 'wise-view-timeline__ticks' });
		const useYears = zoom === 'quarter' || zoom === 'year' || zoom === 'fiveyear';
		for (let day = layout.domain.startDay; day < layout.domain.endDay;) {
			const current = dateOnlyFromDayIndex(day);
			const start = useYears
				? Math.floor(Date.UTC(current.year, 0, 1) / 86_400_000)
				: Math.floor(Date.UTC(current.year, current.month - 1, 1) / 86_400_000);
			const next = useYears
				? Math.floor(Date.UTC(current.year + 1, 0, 1) / 86_400_000)
				: Math.floor(Date.UTC(current.year, current.month, 1) / 86_400_000);
			const from = Math.max(start, layout.domain.startDay);
			const to = Math.min(next, layout.domain.endDay);
			const block = periods.createDiv({
				cls: 'wise-view-timeline__period',
				text: useYears ? String(current.year) : new Date(day * 86_400_000).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
			});
			block.style.setProperty('--wise-view-timeline-left', `${dateToPixel(from, layout.domain, zoom)}px`);
			block.style.setProperty('--wise-view-timeline-period-width', `${dateToPixel(to, layout.domain, zoom) - dateToPixel(from, layout.domain, zoom)}px`);
			day = next;
		}
		for (let day = layout.domain.startDay; day < layout.domain.endDay; day++) {
			const date = new Date(day * 86_400_000);
			const weekday = date.getUTCDay();
			const show = zoom === 'day' || zoom === 'week' || zoom === 'biweek'
				|| (zoom === 'month' && weekday === 1)
				|| (zoom === 'quarter' && date.getUTCDate() === 1)
				|| ((zoom === 'year' || zoom === 'fiveyear') && date.getUTCDate() === 1 && date.getUTCMonth() % 3 === 0);
			if (!show) continue;
			const label = zoom === 'day' || zoom === 'week' || zoom === 'biweek' || zoom === 'month'
				? String(date.getUTCDate())
				: date.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
			const tickEl = ticks.createDiv({ cls: 'wise-view-timeline__tick', text: label });
			tickEl.style.setProperty('--wise-view-timeline-left', `${dateToPixel(day, layout.domain, zoom)}px`);
			if (zoom === 'day' || zoom === 'week' || zoom === 'biweek') {
				tickEl.style.setProperty('--wise-view-timeline-tick-width', `${TIMELINE_ZOOM_SPECS[zoom].pixelsPerDay}px`);
				if (weekday === 0 || weekday === 6) tickEl.classList.add('wise-view-timeline__tick--weekend');
			}
		}
		this.syncHorizontalHeader();
	}

	private renderGrid(layout: TimelineLayout, zoom: TimelineZoom): void {
		this.gridEl.replaceChildren();
		this.gridEl.style.setProperty('--wise-view-timeline-width', `${layout.width}px`);
		this.gridEl.style.height = `${Math.max(this.timelineRows.currentRange.totalHeight, this.timelineViewport.clientHeight)}px`;
		const pixelsPerDay = TIMELINE_ZOOM_SPECS[zoom].pixelsPerDay;
		for (let day = layout.domain.startDay; day < layout.domain.endDay; day++) {
			const date = new Date(day * 86_400_000);
			const weekday = date.getUTCDay();
			if (pixelsPerDay >= 10 && weekday === 6) {
				const weekend = this.gridEl.createDiv({ cls: 'wise-view-timeline__weekend' });
				weekend.style.setProperty('--wise-view-timeline-left', `${dateToPixel(day, layout.domain, zoom)}px`);
				weekend.style.setProperty('--wise-view-timeline-weekend-width', `${pixelsPerDay * 2}px`);
			}
			const lineHere = zoom === 'day' || zoom === 'week' || zoom === 'biweek' || zoom === 'month'
				? weekday === 1
				: zoom === 'quarter'
					? date.getUTCDate() === 1
					: date.getUTCDate() === 1 && date.getUTCMonth() % 3 === 0;
			if (lineHere) {
				const line = this.gridEl.createDiv({ cls: 'wise-view-timeline__gridline' });
				line.style.setProperty('--wise-view-timeline-left', `${dateToPixel(day, layout.domain, zoom)}px`);
			}
		}
	}

	private renderToday(layout: TimelineLayout): void {
		this.containerEl.querySelectorAll('.wise-view-timeline__today, .wise-view-timeline__today-line, .wise-view-timeline__edge').forEach(el => el.remove());
		if (layout.todayEdge === 'inside') {
			const ticks = this.headerCanvas.querySelector<HTMLElement>('.wise-view-timeline__ticks') ?? this.headerCanvas;
			const marker = ticks.createDiv({ cls: 'wise-view-timeline__today', text: String(this.currentToday?.day ?? '') });
			marker.setAttribute('aria-label', 'Today');
			marker.style.setProperty('--wise-view-timeline-left', `${layout.todayLeft}px`);
			const line = this.timelineViewport.createDiv({ cls: 'wise-view-timeline__today-line' });
			line.style.setProperty('--wise-view-timeline-left', `${layout.todayLeft}px`);
			line.style.height = this.gridEl.style.height;
		} else {
			const edge = this.containerEl.createDiv({ cls: `wise-view-timeline__edge wise-view-timeline__edge--${layout.todayEdge}` });
			edge.dataset.edge = layout.todayEdge;
			edge.setText(layout.todayEdge === 'before' ? 'Today is earlier' : 'Today is later');
		}
	}

	private renderEmptyState(model: TimelineModel, rowCount: number): void {
		this.emptyEl.replaceChildren();
		if (!model.startConfigured) {
			this.emptyEl.setText('Configure a start date property in the view options to display the timeline.');
			this.emptyEl.hidden = false;
			return;
		}
		if (rowCount === 0) {
			this.emptyEl.setText('No notes to display.');
			this.emptyEl.hidden = false;
			return;
		}
		this.emptyEl.hidden = true;
	}

	private renderSidebarRow(row: TimelineVirtualRow): VirtualRowHandle {
		const element = this.containerEl.ownerDocument.createElement('div');
		const handle = { element, dispose() {} };
		this.updateSidebarRow(handle, row);
		return handle;
	}

	private updateSidebarRow(handle: VirtualRowHandle, row: TimelineVirtualRow): void {
		handle.element.replaceChildren();
		handle.element.className = `wise-view-timeline__sidebar-row wise-view-timeline__sidebar-row--${row.kind}`;
		if (row.kind === 'group') {
			const button = handle.element.createEl('button', { text: `${row.label} (${row.count})` });
			button.type = 'button';
			button.dataset.action = 'toggle-group';
			button.dataset.groupKey = row.groupKey;
			button.setAttribute('aria-expanded', String(!this.collapsedGroups.has(row.groupKey)));
		} else {
			const button = handle.element.createEl('button', { text: row.item.title });
			button.type = 'button';
			button.dataset.notePath = row.item.path;
			button.title = row.item.unscheduledReason
				? `${row.item.title} — Unscheduled: ${row.item.unscheduledReason}`
				: row.item.title;
		}
	}

	private renderTimelineRow(row: TimelineVirtualRow): VirtualRowHandle {
		const element = this.containerEl.ownerDocument.createElement('div');
		const handle = { element, dispose() {} };
		this.updateTimelineRow(handle, row);
		return handle;
	}

	private updateTimelineRow(handle: VirtualRowHandle, row: TimelineVirtualRow): void {
		handle.element.replaceChildren();
		handle.element.className = `wise-view-timeline__row wise-view-timeline__row--${row.kind}`;
		handle.element.style.setProperty('--wise-view-timeline-width', `${this.currentLayout?.width ?? 0}px`);
		if (row.kind === 'group') {
			handle.element.createSpan({ cls: 'wise-view-timeline__group-label', text: row.label });
			return;
		}
		const bar = this.bars.get(row.item.path);
		if (!bar) {
			handle.element.classList.add('wise-view-timeline__row--unscheduled');
			handle.element.dataset.notePath = row.item.path;
			return;
		}
		const startDay = rangeToDayBounds(row.item.range!).startDay;
		const endDay = rangeToDayBounds(row.item.range!).endDay - 1;
		const startLabel = handle.element.createSpan({
			cls: 'wise-view-timeline__date-label wise-view-timeline__date-label--start',
			text: this.formatDay(startDay),
		});
		startLabel.style.setProperty('--wise-view-timeline-left', `${bar.left}px`);
		const endLabel = handle.element.createSpan({
			cls: 'wise-view-timeline__date-label wise-view-timeline__date-label--end',
			text: this.formatDay(endDay),
		});
		endLabel.style.setProperty('--wise-view-timeline-left', `${bar.left + bar.width}px`);
		const barEl = handle.element.createEl('button', { cls: 'wise-view-timeline__bar' });
		barEl.type = 'button';
		barEl.dataset.notePath = row.item.path;
		barEl.title = `${row.item.title} — ${dateOnlyFromDayIndex(startDay).iso} – ${dateOnlyFromDayIndex(endDay).iso}`;
		barEl.createSpan({ cls: 'wise-view-timeline__bar-label', text: row.item.title });
		barEl.createSpan({ cls: 'wise-view-timeline__handle wise-view-timeline__handle--left' });
		barEl.createSpan({ cls: 'wise-view-timeline__handle wise-view-timeline__handle--right' });
		barEl.dataset.colorValue = row.item.colorValue ?? '';
		if (row.item.colorValue) {
			for (const [name, value] of Object.entries(toCssVariables(resolveColor({ categoryValue: row.item.colorValue })))) {
				barEl.style.setProperty(name, value);
			}
		}
		barEl.style.setProperty('--wise-view-timeline-left', `${bar.left}px`);
		barEl.style.setProperty('--wise-view-timeline-bar-width', `${bar.width}px`);
	}
}
