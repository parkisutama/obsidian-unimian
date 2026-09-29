// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { setIcon } from 'obsidian';
import type { ViewRuntime } from '../../platform/dom/ViewRuntime';
import { GANTT_SCALES, type GanttScale } from './options';

export interface GanttToolbarActions {
	onScale(scale: GanttScale): void;
	onToday(): void;
	onZoomToFit(): void;
	onAddTask(): void;
	onCollapseAll(): void;
	onExpandAll(): void;
}

const SCALE_LABELS: Record<GanttScale, string> = {
	day: 'Hours', week: 'Days', month: 'Weeks', quarter: 'Months', year: 'Quarters',
};

/** Obsidian-native controls around the headless chart toolbar API. */
export class GanttToolbar {
	private readonly scaleSelect: HTMLSelectElement;
	private readonly addButton: HTMLButtonElement;

	constructor(container: HTMLElement, runtime: ViewRuntime, actions: GanttToolbarActions) {
		container.addClass('unimian-gantt-toolbar');
		container.setAttribute('role', 'toolbar');
		container.setAttribute('aria-label', 'Gantt controls');

		this.scaleSelect = container.createEl('select', { cls: 'dropdown unimian-gantt-toolbar__scale' });
		this.scaleSelect.setAttribute('aria-label', 'Time resolution');
		for (const scale of GANTT_SCALES) {
			const option = this.scaleSelect.createEl('option', { text: SCALE_LABELS[scale] });
			option.value = scale;
		}
		runtime.addEventListener(this.scaleSelect, 'change', () => actions.onScale(this.scaleSelect.value as GanttScale));

		this.button(container, runtime, 'calendar-days', 'Today', actions.onToday);
		this.button(container, runtime, 'scan', 'Zoom to fit', actions.onZoomToFit);
		this.addButton = this.button(container, runtime, 'plus', 'Add task', actions.onAddTask);
		this.button(container, runtime, 'chevrons-down-up', 'Collapse all', actions.onCollapseAll);
		this.button(container, runtime, 'chevrons-up-down', 'Expand all', actions.onExpandAll);
	}

	update(scale: GanttScale, canAddTask: boolean): void {
		this.scaleSelect.value = scale;
		this.addButton.disabled = !canAddTask;
	}

	private button(
		container: HTMLElement,
		runtime: ViewRuntime,
		icon: string,
		label: string,
		action: () => void,
	): HTMLButtonElement {
		const button = container.createEl('button', { cls: 'clickable-icon unimian-gantt-toolbar__button' });
		button.type = 'button';
		button.setAttribute('aria-label', label);
		button.title = label;
		setIcon(button, icon);
		button.createSpan({ cls: 'unimian-gantt-toolbar__label', text: label });
		runtime.addEventListener(button, 'click', action);
		return button;
	}
}
