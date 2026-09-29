// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { Keymap, type App, type Component } from 'obsidian';
import type { ViewRuntime } from '../../platform/dom/ViewRuntime';
import { openPath, triggerHoverPreview } from '../../platform/navigation/NavigationService';
import { showOpenFileMenu } from '../../utils/openFile';

export interface GanttNavigationOptions {
	app: App;
	/** Contains the chart, its task list, and the detail panel. */
	root: HTMLElement;
	runtime: ViewRuntime;
	/** The Component Obsidian ties a hover preview's lifetime to. */
	hoverParent: Component;
	/** The registered hover source id (the view id), so Page Preview honours its modifier setting. */
	sourceId: string;
	/** Synthetic phase rows and unknown ids are not notes; they get no menu, preview or navigation. */
	isNote(path: string): boolean;
}

/** Set on the root while Ctrl/Cmd is held, so the library's hover card can step aside for Page Preview. */
export const PREVIEWING_CLASS = 'unimian-gantt-previewing';

/**
 * Note-opening behaviour Obsidian users expect, as delegated listeners so it survives the chart's
 * virtualized re-renders: Page Preview on hover, the open-in-tab/split/window menu on right-click, and
 * modifier-click to open. Plain clicks are left to the library (they select the task and open the
 * detail panel), except on the panel's own note links, which handle their click themselves.
 */
export function installGanttNavigation(options: GanttNavigationOptions): void {
	const { app, root, runtime } = options;

	const resolve = (target: EventTarget | null): { path: string; el: HTMLElement } | null => {
		if (!(target instanceof HTMLElement)) return null;
		const el = target.closest<HTMLElement>('[data-note-path], .gantt-task-bar[data-task-id], .gantt-grid-row[data-row-id]');
		if (!el || !root.contains(el)) return null;
		const path = el.dataset.notePath ?? el.dataset.taskId ?? el.dataset.rowId;
		return path && options.isNote(path) ? { path, el } : null;
	};

	runtime.addEventListener(root, 'contextmenu', event => {
		const hit = resolve(event.target);
		if (hit && event instanceof MouseEvent) showOpenFileMenu(app, hit.path, event);
	});

	runtime.addEventListener(root, 'mouseover', event => {
		if (!(event instanceof MouseEvent)) return;
		const hit = resolve(event.target);
		if (!hit) return;
		// Moving between children of one bar or row is not a new hover.
		if (event.relatedTarget instanceof Node && hit.el.contains(event.relatedTarget)) return;
		triggerHoverPreview({
			app, hoverParent: options.hoverParent, sourceId: options.sourceId,
			event, filePath: hit.path, targetEl: hit.el, sourcePath: '',
		});
	});

	// Capture phase: a modifier-click opens the note instead of also selecting the bar. The panel's own
	// note links carry data-note-path and open themselves, so they are skipped here.
	runtime.addEventListener(root, 'click', event => {
		if (!(event instanceof MouseEvent) || !Keymap.isModEvent(event)) return;
		if (event.target instanceof HTMLElement && event.target.closest('[data-note-path]')) return;
		const hit = resolve(event.target);
		if (!hit) return;
		event.preventDefault();
		event.stopPropagation();
		openPath(app, hit.path, event);
	}, true);

	const syncModifier = (event: Event) => {
		const key = event as KeyboardEvent;
		root.toggleClass(PREVIEWING_CLASS, key.ctrlKey || key.metaKey);
	};
	runtime.addEventListener(runtime.doc, 'keydown', syncModifier);
	runtime.addEventListener(runtime.doc, 'keyup', syncModifier);
	runtime.addEventListener(runtime.win, 'blur', () => root.removeClass(PREVIEWING_CLASS));
	runtime.add(() => root.removeClass(PREVIEWING_CLASS));
}
