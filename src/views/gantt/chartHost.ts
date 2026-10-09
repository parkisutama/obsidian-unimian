// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import {
	type GanttHandle,
	type GanttProps,
	type GanttScaleKey,
	ReactGanttChart,
	type Task,
} from "@jaeungkim/gantt-chart";
import { type ComponentChild, h } from "preact";
import { render } from "preact/compat";
import type { ViewRuntime } from "../../platform/dom/ViewRuntime";
import { TooltipGuard } from "./tooltipGuard";

export type GanttTheme = "light" | "dark";
export type ChartRender = (node: ComponentChild, container: Element) => void;

export interface GanttChartModel {
	tasks: Task[];
	unscheduledCount: number;
	rowHeight: number;
	props: GanttProps;
}

function bodyTheme(body: HTMLElement): GanttTheme {
	return body.classList.contains("theme-dark") ? "dark" : "light";
}

/** Owns the Preact tree and the owning-window theme observer for one Gantt view. */
export class GanttChartHost {
	private theme: GanttTheme;
	private readonly observer: MutationObserver;
	private disposed = false;
	private model: GanttChartModel | null = null;
	private remountKey = 0;
	private handle: GanttHandle | null = null;
	private readonly tooltipGuard: TooltipGuard;

	constructor(
		private readonly containerEl: HTMLElement,
		private readonly runtime: ViewRuntime,
		private readonly renderChart: ChartRender = render,
	) {
		this.theme = bodyTheme(runtime.doc.body);
		const MutationObserverCtor = (
			runtime.win as Window & { MutationObserver: typeof MutationObserver }
		).MutationObserver;
		this.observer = new MutationObserverCtor(() => this.refreshTheme());
		this.observer.observe(runtime.doc.body, { attributes: true, attributeFilter: ["class"] });
		this.tooltipGuard = new TooltipGuard(containerEl, runtime.win);
	}

	get currentTheme(): GanttTheme {
		return this.theme;
	}

	private refreshTheme(): void {
		const nextTheme = bodyTheme(this.runtime.doc.body);
		if (nextTheme === this.theme) return;
		this.theme = nextTheme;
		this.paint();
	}

	private paint(): void {
		if (!this.model) return;
		if (this.model.tasks.length === 0) {
			this.renderChart(
				h(
					"div",
					{ class: "unimian-gantt-empty" },
					this.model.unscheduledCount > 0
						? `${this.model.unscheduledCount} note(s) need a configured start date.`
						: "No scheduled notes.",
				),
				this.containerEl,
			);
			return;
		}
		this.renderChart(
			h(ReactGanttChart, {
				key: this.remountKey,
				ref: (handle: GanttHandle | null) => {
					this.handle = handle;
				},
				tasks: this.model.tasks,
				height: "100%",
				width: "100%",
				theme: this.theme,
				...this.model.props,
			}),
			this.containerEl,
		);
		this.tooltipGuard.sweep();
	}

	setScale(scale: GanttScaleKey): void {
		this.handle?.setScale(scale);
	}

	scrollToToday(): void {
		this.handle?.scrollToToday();
	}

	zoomToFit(): void {
		this.handle?.zoomToFit();
	}

	addTask(): void {
		this.handle?.addTask();
	}

	/** Row height is a CSS-only update; unchanged task/prop references do not repaint Preact. */
	update(model: GanttChartModel): void {
		this.containerEl.style.setProperty("--gantt-row-height", `${model.rowHeight}px`);
		const repaint =
			!this.model ||
			this.model.tasks !== model.tasks ||
			this.model.props !== model.props ||
			this.model.unscheduledCount !== model.unscheduledCount;
		this.model = model;
		if (repaint) this.paint();
	}

	/**
	 * Puts the chart back on `tasks` after a failed write by remounting it. The library keeps the
	 * last `tasks` prop it saw and ignores a re-passed array with identical contents, so a plain
	 * update cannot undo an edit it already applied. Scroll, collapse and selection reset; that is
	 * the price of an honest rollback, paid only on failure.
	 */
	revert(tasks: Task[]): void {
		if (!this.model) return;
		this.remountKey += 1;
		this.model = { ...this.model, tasks };
		this.paint();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.observer.disconnect();
		this.handle = null;
		this.renderChart(null, this.containerEl);
		this.tooltipGuard.dispose();
	}
}
