// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { BasesView, Notice, type QueryController } from 'obsidian';
import type WiseViewPlugin from '../../main';
import { createEntrySnapshotGroups } from '../../platform/bases/entrySnapshotAdapter';
import { ViewConfigReader } from '../../platform/bases/ViewConfigReader';
import { ViewRuntime } from '../../platform/dom/ViewRuntime';
import { LegacyMutationGateway } from '../../platform/mutations/LegacyMutationGateway';
import { activateEntry, isActivationKey, openPath, triggerHoverPreview } from '../../platform/navigation/NavigationService';
import { showOpenFileMenu } from '../../utils/openFile';
import { dateOnlyFromDayIndex } from '../../core/temporal/TemporalValue';
import { buildTimelineModel } from './TimelineModel';
import { TimelineRenderer } from './TimelineRenderer';
import { readTimelineOptions, timelineRequestedProperties } from './timelineOptions';

export const BASES_TIMELINE_VIEW_ID = 'wise-view-timeline';

function localToday() {
	const now = new Date();
	return dateOnlyFromDayIndex(Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000));
}

export class BasesTimelineView extends BasesView {
	type = BASES_TIMELINE_VIEW_ID;
	private readonly runtime: ViewRuntime;
	private readonly renderer: TimelineRenderer;
	private readonly mutations: LegacyMutationGateway;
	/** Centers the timeline on today exactly once, the first time it has a real, laid-out size. */
	private hasCenteredOnToday = false;

	constructor(controller: QueryController, private readonly containerEl: HTMLElement, private readonly plugin: WiseViewPlugin) {
		super(controller);
		this.runtime = new ViewRuntime(containerEl);
		this.mutations = new LegacyMutationGateway(this.app);
		this.renderer = this.runtime.own(new TimelineRenderer(containerEl, {
			onQuickSchedule: (path, startDay, endDay) => { void this.quickSchedule(path, startDay, endDay); },
			onRangeChange: (path, startDay, endDay) => this.updateRange(path, startDay, endDay),
			onZoomChange: zoom => this.config.set('zoom', zoom),
		}));
	}

		onload(): void {
		this.runtime.addEventListener(this.containerEl, 'click', event => this.handleClick(event));
		this.runtime.addEventListener(this.containerEl, 'change', event => this.handleControlChange(event));
		this.runtime.addEventListener(this.containerEl, 'contextmenu', event => this.showContextMenu(event));
		this.runtime.addEventListener(this.containerEl, 'mouseover', event => this.showHover(event));
		this.runtime.addEventListener(this.containerEl, 'keydown', event => {
			if (event instanceof KeyboardEvent && isActivationKey(event)) this.activate(event);
		});
		const ResizeObserverCtor = (this.runtime.win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
		if (ResizeObserverCtor) {
			const observer = new ResizeObserverCtor(entries => {
				const width = entries[0]?.contentRect.width ?? this.containerEl.clientWidth;
				this.renderer.setNarrow(width < 600);
				this.renderer.refreshViewport();
				this.centerOnTodayOnce();
			});
			observer.observe(this.containerEl);
			this.runtime.observe(observer);
		}
	}

	/**
	 * Centers the timeline on today exactly once, the first time the container has a real,
	 * laid-out width — matching what clicking "Today" does, instead of settling wherever the
	 * domain's own left edge happens to fall when the view is first created. Called from both
	 * onDataUpdated (covers the common case where the container is already attached and sized
	 * by the time data loads) and the ResizeObserver (covers the rest: not yet attached, or no
	 * ResizeObserver support at all — in which case this never fires and the view falls back to
	 * its default position, same as before this behavior existed).
	 */
	private centerOnTodayOnce(): void {
		if (this.hasCenteredOnToday || this.containerEl.clientWidth <= 0) return;
		this.hasCenteredOnToday = true;
		this.renderer.scrollToToday();
	}

	onDataUpdated(): void {
		if (!this.data?.groupedData) return;
		const options = readTimelineOptions(new ViewConfigReader(this.config));
		const properties = timelineRequestedProperties(options);
		const snapshotGroups = createEntrySnapshotGroups(this.data.groupedData, properties);
		const today = localToday();
		this.renderer.render(buildTimelineModel(snapshotGroups, options, today), today, options.zoom, options.wrapTitles, true);
		this.centerOnTodayOnce();
	}

	onunload(): void {
		this.runtime.dispose();
		this.containerEl.replaceChildren();
	}

	private pathFromEvent(event: Event): string | null {
		const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-note-path]') : null;
		return target?.dataset.notePath ?? null;
	}

	private handleClick(event: Event): void {
		const action = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
		if (action?.dataset.action === 'today') {
			this.renderer.scrollToToday();
			return;
		}
		if (action?.dataset.action === 'toggle-sidebar') {
			this.renderer.toggleSidebar();
			return;
		}
		if (action?.dataset.action === 'zoom-to-fit') {
			this.renderer.zoomToFit();
			return;
		}
		if (action?.dataset.action === 'toggle-group' && action.dataset.groupKey) {
			this.renderer.toggleGroup(action.dataset.groupKey);
			return;
		}
		this.activate(event);
	}

	private handleControlChange(event: Event): void {
		const select = event.target instanceof HTMLSelectElement ? event.target : null;
		if (select?.dataset.action !== 'zoom') return;
		this.renderer.setZoom(select.value as Parameters<TimelineRenderer['setZoom']>[0]);
	}

	private activate(event: Event): void {
		const path = this.pathFromEvent(event);
		if (!path) return;
		if (event instanceof KeyboardEvent) event.preventDefault();
		activateEntry({
			app: this.app,
			settings: this.plugin.settings,
			path,
			event: event as MouseEvent | KeyboardEvent,
			openFull: (p, e) => openPath(this.app, p, e),
		});
	}

	private showContextMenu(event: Event): void {
		if (!(event instanceof MouseEvent)) return;
		const path = this.pathFromEvent(event);
		if (path) showOpenFileMenu(this.app, path, event);
	}

	private showHover(event: Event): void {
		if (!(event instanceof MouseEvent) || !(event.target instanceof HTMLElement)) return;
		const targetEl = event.target.closest<HTMLElement>('[data-note-path]');
		const filePath = targetEl?.dataset.notePath;
		if (!targetEl || !filePath) return;
		triggerHoverPreview({
			app: this.app,
			hoverParent: this.plugin,
			sourceId: BASES_TIMELINE_VIEW_ID,
			event,
			filePath,
			targetEl,
		});
	}

	private async quickSchedule(path: string, startDay: number, endDay: number): Promise<void> {
		const options = readTimelineOptions(new ViewConfigReader(this.config));
		if (!options.startProperty) return;
		const result = await this.mutations.updateRange(
			path,
			options.startProperty,
			dateOnlyFromDayIndex(startDay).iso,
			options.endProperty,
			options.endProperty ? dateOnlyFromDayIndex(endDay).iso : null,
		);
		if (!result.ok) new Notice(`Unable to schedule note: ${result.message}`);
	}

	private async updateRange(path: string, startDay: number, endDay: number): Promise<boolean> {
		const options = readTimelineOptions(new ViewConfigReader(this.config));
		if (!options.startProperty) return false;
		const result = await this.mutations.updateRange(
			path,
			options.startProperty,
			dateOnlyFromDayIndex(startDay).iso,
			options.endProperty,
			options.endProperty ? dateOnlyFromDayIndex(endDay).iso : null,
		);
		if (!result.ok) new Notice(`Unable to update timeline dates: ${result.message}`);
		return result.ok;
	}
}
