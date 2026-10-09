// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { type App, Menu, TFile } from "obsidian";
import { QuickPreviewModal } from "../platform/preview/QuickPreviewModal";

/**
 * Open a file in a new tab.
 * Standard single-click behavior across all Planner views.
 */
export function openFileInNewTab(app: App, path: string): void {
	void app.workspace.openLinkText(path, "", "tab");
}

function openFileInSplit(
	app: App,
	path: string,
	direction: "vertical" | "horizontal",
	before?: boolean,
): void {
	const activeLeaf = app.workspace.getLeaf(false);
	const leaf = app.workspace.createLeafBySplit(activeLeaf, direction, before);
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		void leaf.openFile(file);
	}
}

export function addOpenFileMenuItems(
	app: App,
	path: string,
	menu: Menu,
	options: { includeOpen?: boolean } = {},
): void {
	menu.addItem((item) =>
		item
			.setTitle("Quick preview")
			.setIcon("eye")
			.onClick(() =>
				new QuickPreviewModal(
					app,
					path,
					(p) => void app.workspace.openLinkText(p, "", "tab"),
				).open(),
			),
	);
	menu.addSeparator();

	if (options.includeOpen) {
		menu.addItem((item) =>
			item
				.setTitle("Open")
				.setIcon("file")
				.onClick(() => void app.workspace.openLinkText(path, "", false)),
		);
	}

	menu.addItem((item) =>
		item
			.setTitle("Open in new tab")
			.setIcon("file-plus")
			.onClick(() => void app.workspace.openLinkText(path, "", "tab")),
	);

	menu.addItem((item) =>
		item
			.setTitle("Open to the right")
			.setIcon("separator-vertical")
			.onClick(() => openFileInSplit(app, path, "vertical")),
	);

	menu.addItem((item) =>
		item
			.setTitle("Open above")
			.setIcon("separator-horizontal")
			.onClick(() => openFileInSplit(app, path, "horizontal", true)),
	);

	menu.addItem((item) =>
		item
			.setTitle("Open below")
			.setIcon("separator-horizontal")
			.onClick(() => openFileInSplit(app, path, "horizontal")),
	);

	menu.addItem((item) =>
		item
			.setTitle("Open to the left")
			.setIcon("separator-vertical")
			.onClick(() => openFileInSplit(app, path, "vertical", true)),
	);

	menu.addItem((item) =>
		item
			.setTitle("Open in new window")
			.setIcon("picture-in-picture-2")
			.onClick(() => void app.workspace.openLinkText(path, "", "window")),
	);
}

/**
 * Show a right-click context menu with file open location options.
 * Centralised for all Planner views.
 */
export function showOpenFileMenu(app: App, path: string, event: MouseEvent): void {
	showOpenFileMenuWithItems(app, path, event);
}

export function showOpenFileMenuWithItems(
	app: App,
	path: string,
	event: MouseEvent,
	addLeadingItems?: (menu: Menu) => void,
	addTrailingItems?: (menu: Menu) => void,
): void {
	event.preventDefault();
	event.stopPropagation();
	event.stopImmediatePropagation();

	const doc = event.view?.document ?? document;
	const win = event.view ?? window;
	const position = {
		x: event.clientX,
		y: event.clientY,
	};

	win.setTimeout(() => {
		closeContextMenus(doc);

		const menu = new Menu();
		addLeadingItems?.(menu);
		if (addLeadingItems) {
			menu.addSeparator();
		}
		addOpenFileMenuItems(app, path, menu);
		if (addTrailingItems) {
			menu.addSeparator();
			addTrailingItems(menu);
		}
		menu.showAtPosition(position, doc);
	}, 0);
}

function closeContextMenus(doc: Document): void {
	doc.querySelectorAll(".menu").forEach((menuEl) => {
		menuEl.remove();
	});
}
